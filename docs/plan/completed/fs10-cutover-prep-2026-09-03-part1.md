*Part 1 of 3 of the FS-10 cutover PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: none (this is the first part) · Next: `fs10-cutover-prep-2026-09-03-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

# Ceremony prep — FS-10 / P6-X: the production frontend cutover (`app.clarabook.com` → `apps/web`)

**Prepared 2026-09-03 ≈18:15 MYT from `main` at `5eab358d`. FOLD PASS 2026-09-03 ≈18:55 MYT — ten critic
findings folded, the chat/SSE question SETTLED BY MEASUREMENT, and every state re-measured from the TREE or
`gh` rather than from `PROGRESS.md`'s banner (which is stale on FS-4 until truing-4 lands).**
Prepared by a read-only lane: no repo edit, no commit, no migration, no live DSN, no rig, no secret printed.
**NOTHING BELOW HAS BEEN RUN.**

**What it ships.** Cloudflare stops serving the OLD `apps/dashboard` (a Cloudflare **Pages** project named
`clara`, custom domain `app.clarabook.com`) and starts serving `apps/web` as a Cloudflare **Worker** named
`clara-web` (`apps/web/wrangler.jsonc:3`), built by `@opennextjs/cloudflare`. Then, and only after the
Worker has been proven on the real origin, `apps/dashboard`'s source is deleted and the Pages project is
retired.

**The one sequencing law that governs the whole ceremony** (`fe-train-plan-2026-08-30-orders-p6.md:450-454`,
restated at `fe-train-plan-2026-08-30.md:411-415`):

> the proxy repoint and the Pages retirement are separable from the source delete and **must not ride the
> same commit**: repoint first, **prove the Workers build serves every route**, *then* delete. **A rollback
> after a repoint is a repoint; a rollback after a delete is a restore.**

---

> **RIDERS — rulings and PR #539, written ≈20:2x 09-03 AFTER this record (fold into the as-run; the body
> below still carries the pre-ruling text):**
> **(R1) Rulings so far** (`…/scratchpad/truing/ruling-15N.md`): 裁-151 D1 = option (b), the same-origin
> proxy · 裁-152 D2 = the owner mints the pepper + the auth-wall service token ONCE at S8, same bytes to
> `clara-runtime` at FS-11 step 12, the hash compare THERE · 裁-153 D3 = the four security lines deferred
> explicitly to FS-11 steps 12/11/6/13 · 裁-154 D6 = no allowlist widening, preview = password only,
> confirm/recover on the real origin at S21 · 裁-155 D7 = `?ct=` redaction is S16 (look first; configure +
> prove, or a dated explicit deferral) · **裁-156 D5 = NO SOAK, owner ruled against the 24 h: the Pages
> project delete follows the real-origin re-walk (S21, with the three observations folded in as S21's own
> reads) in the SAME sitting; fix-forward on the Worker is the only rollback** · 裁-157 D4 = no maintenance
> page during FS-11; the as-run records the window. D8 rode #539.
> **(R2) PR #539 (`8b8ed7e5`, the OD-1/OD-2 code PR):** S8's `wrangler secret put` list DROPS
> `CLARA_RUNTIME_URL`, `CLARA_PUBLIC_ORIGINS`, `CLARA_TRUSTED_CLIENT_IP_HEADER` — they are `vars` in
> `apps/web/wrangler.jsonc` now (one name, one home; never both a var and a secret). The secrets that remain
> for `clara-web` are the credential-bearing names only — read the final list from the merged `.env.example`
> + `wrangler.jsonc`, never from this prep. `NEXT_PUBLIC_CLARA_RUNTIME_URL` no longer exists — any S5/S7
> line naming it is stale. **S14 still owes the OpenNext-on-Workers streaming proof** (`next start` is
> Node; the Worker is workerd); D1's fallback (a runtime CORS allowlist) stands ONLY if the preview does not
> stream.
> **(R3) `CLARA_PUBLIC_ORIGINS` posture (from #539's review, nit 6):** the `vars` block REPLACES any
> dashboard-set plain-text var on every `wrangler deploy` — the dashboard is not a home for these three names
> any more. The value ships NARROW (`https://app.clarabook.com`) from the first upload. On the `workers.dev`
> preview every same-origin-walled POST (signup confirm, checkout, invite courier, recovery) therefore REFUSES —
> that is the wall's positive proof and is RECORDED as such at S14 (the "UNSET arm first" line); never widen
> the list for a preview; the walled arms are proven on the real origin at S21 (裁-154, 裁-156). FS-10 E's
> "narrow `CLARA_PUBLIC_ORIGINS`" is now a READ of the served value, not a write. Measured on the wire by the
> review: the SSE body streams through the proxy (`transfer-encoding: chunked`, `content-type:
> text/event-stream`), `cache-control` is `private, no-store` (the auth floor) — S14 must not expect
> `no-cache, no-transform`.

# OWNER DECISIONS — read these before the recipe

Eight rulings this record still needs. Each: the question in one sentence (English, then 大白话), the
recommendation, its cost, and what happens if it is not ruled. **D1 and D2 are LAUNCH BLOCKERS — the ceremony
cannot be opened without them.** The lettered acts in §4 are what the owner *does*; these are what the owner
*decides*.

---

### D1 · The chat and SSE origin — SETTLED BY MEASUREMENT, and it needs a code PR before FS-10. **LAUNCH BLOCKER.**

**Question (en).** The chat and stream lanes of `apps/web` are the only runtime callers still wired to a
build-time browser URL instead of the same-origin `/api/runtime/*` proxy that intake and the interview runner
already use — do we (b) repoint those two files at the existing proxy, or (a) open a CORS allowlist on the
runtime's chat and stream routes?

**问题（大白话）.** 新版网页里，只有「聊天」和「实时流」这两条路还在直接打 Fly 上的 runtime（跨域），而文件上传和访谈引擎
早就改走同源代理 `/api/runtime/*` 了。现在测出来：**这两条路在部署后一定是坏的** —— 变量设了会被浏览器跨域拦掉，变量不设就打到
一个新版网页根本没有的地址（404）。要么 (b) 把这两个文件改成走已有的同源代理（改前端，两三个文件），要么 (a) 在 runtime 那边给
聊天和流开跨域许可（改后端）。两条都要改代码，都要在 FS-10 之前先合并一个 PR。

**Recommendation: (b) — repoint `lib/clara/api.ts` and `lib/clara/stream.ts` at `/api/runtime/*`.** The proxy
already carries these routes by construction (it has no per-route allowlist —
`app/api/runtime/[...path]/route.ts:28-32`, and maps `/api/runtime/<p…>` → `${CLARA_RUNTIME_URL}/api/<p…>` at
`:48`), already sends the correct credential for a session leg (`lib/runtime/outbound.ts:123-131` defaults
every unclassified leg to `session`; `:196-198` writes the guard-verified bearer), already streams the
response body through (`route.ts:116` returns `new Response(res.body, …)` with `content-type` and
`cache-control` in its allow-list at `:108-109`), and already exports the two verbs chat needs (`:153-155`,
GET/POST/PUT). Option (a) would put the Supabase JWT back on a direct browser→Fly wire and re-freeze a
`NEXT_PUBLIC_*` value at build time — the exact two shapes the 2026-08-27 review (F1/F2/F3) and the
2026-07-26 intake incident were about. The full measurement is §5 R1.

**Cost.** One small `apps/web` code PR under the full ADR-061 ladder: `lib/clara/api.ts` (`runtimeBase()` at
`:56-58` and the five call sites at `:116`, `:129`, `:138`, `:148`, `:172`), `lib/clara/stream.ts:240-242`,
`lib/clara/useClaraThread.ts:70-72`, plus the five suites that set `NEXT_PUBLIC_CLARA_RUNTIME_URL` and the
e2e mock at `apps/web/e2e/chat-parity-mock.mjs:209-211`. Roughly 0.5 lane-unit + one opus review. **One
unknown it cannot settle on its own:** whether a Route Handler's streamed body survives OpenNext-on-Workers.
Nothing in the repo proves it, so S13 on the preview is the instrument, and option (a) is the standing fallback
if the preview does not stream.

**If it is not ruled.** The cutover ships an app whose chat and stream are dead on the real origin — the
single highest-value surface of the product — and the failure is invisible until a human opens a thread,
because no CI leg and no e2e covers it (the e2e harness answers `/api/chat/*` from its own mock server).

---

### D2 · Which ceremony MINTS `CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN`. **LAUNCH BLOCKER.**

**Question (en).** FS-10 sets both values on `clara-web` and FS-11 step 11 sets them on `clara-runtime`, both
saying "identical to the other's" and both proving it by comparing a hash across the two environments — so
which ceremony mints them, and where does the equality read actually happen?

**问题（大白话）.** 有两个必须「两边一模一样」的密钥（速率墙的 pepper、认证墙的服务令牌）。现在两份仪式记录都写着「跟对面一样」
——可是对面还没有，等于两边都在等对方先有。所以要定：**谁先造这两个值**？

**Recommendation: the owner MINTS both ONCE at FS-10 (step S7), sets them on `clara-web` env-to-env, and keeps
the same two values for FS-11 step 11 to set on `clara-runtime`.** The hash-equality proof is explicitly
**DEFERRED to FS-11 step 11**, where the runtime's half first exists — it is the first moment the comparison
has two operands. FS-10 records instead: the two names present in `wrangler secret list --name clara-web`, and
a stated, dated line in the as-run saying these are the minting values that FS-11 must reuse verbatim.

**Cost.** Zero extra work; it is a sequencing statement. The alternative (defer both to FS-11 wholesale) is also
lawful and costs nothing either — but then `apps/web`'s `POST /checkout` refuses fail-closed on the deployed
origin for the whole window between the two ceremonies, and the S12 read must say so.

**If it is not ruled.** Both ceremonies hold an instrument that cannot run (`wave-g-setup-checklist.md:132-133`
demands a hash comparison), and the likeliest outcome is that each mints its own value — two peppers, one wall
split in two, and every confirmation 401s with nothing in either app's configuration looking wrong.

---

### D3 · Which security-pass cutover lines defer, and to which NUMBERED FS-11 step.

**Question (en).** The security pass's eleven cutover lines must all be ticked "before the deployed origin serves
`/signup` at all", but lines 3, 4, 5 and 7 depend on acts the re-sequenced order places in FS-11 — do we ship
FS-10 with those four explicitly deferred and pointed at a numbered FS-11 step, or move FS-11's relevant half in
front of the cutover?

**问题（大白话）.** 安全清单有 11 条，规定「部署后的网址开始接客之前，每条都要打勾」。其中 4 条（trusted-IP 信使、
`clara_auth_wall_login` 改成可登录、ACL 基线、DPA 那条）靠的东西按现在的顺序排在 FS-11（这次仪式之后）。所以要么这次上线就
**写清楚这四条是延后的、各自延到 FS-11 的哪一步**，要么把 FS-11 的那半提到前面来。不能装作已经打勾。

**Recommendation: defer, explicitly, each pointed at a numbered FS-11 step** — line 3 (`CLARA_TRUSTED_CLIENT_IP_HEADER`
+ `CLARA_RATE_WALL_PEPPER` live, `originDigest` no longer `undefined`) → FS-11 **step 11**; line 4
(`clara_auth_wall_login` flipped to LOGIN + its DSN) → FS-11 **step 10**; line 7 (the DPA read repointed +
one completed TEST-mode paid walk) → FS-11 **step 12**. Line 5 (`packages/db/deploy/acl-baseline.sql` run on
the live project) has **no numbered FS-11 step today** — it is named only inside FS-11's §5 rollback
(`fs11-wave-g-reset-prep.md:501-503`) — so it needs one **inserted after FS-11 step 5 (MIGRATE)**, with its own
read: `VERIFY: OK` from the script, then a positive read that `clara_auth_wall` holds no `public` USAGE.
Until then the deployed origin must not serve `/signup` to a real applicant — which is exactly what S12 proves.

**Cost.** One paragraph in this record's §5 R2 and one inserted step in the FS-11 record — no ceremony time.

**If it is not ruled.** Line 5 falls *between* the two ceremonies and nobody owns it: the confined checkout-gate
roles keep `public` schema USAGE on the live project, which the migration tails deliberately do not cover.

---

### D4 · The between-ceremony posture — the soak runs over FS-11's reset unless one is declared.

**Question (en).** FS-10 ends with the Worker publicly serving `app.clarabook.com` and a soak that buys the cheap
rollback, and FS-11 then stops the runtime and runs `DROP SCHEMA clara CASCADE` underneath it — so does FS-11
run inside a declared maintenance window on the live origin, or does FS-10's soak close and get recorded first?

**问题（大白话）.** FS-10 做完，新版网页已经在真实域名上对外服务了；FS-11 紧接着要**把数据库整个 schema 删掉重建**（唯一的重置
机制，没有增量）。中间这段时间，网站是开着的但底下的数据在被换。所以要定：**FS-11 是在一个公开宣告的维护窗口里做**，还是
**先把 FS-10 的观察期跑完、证据写完，再开 FS-11**？

**Recommendation: FS-10's soak closes and is recorded BEFORE FS-11 opens, and FS-11 runs inside a declared
maintenance window regardless.** Two reasons, both measured: the reset is `DROP SCHEMA clara CASCADE` followed
by a fresh apply of `0001`…`0164` — there is no delta apply (`fs11-wave-g-reset-prep.md:237` and its §1.1;
constraint 15 keeps `workflow` / `graphile_worker` / `spike` untouched) — so every route the soak is watching
returns errors for the whole reset; and a soak observation taken across a reset is not evidence of the Worker,
which is the only thing the soak exists to measure. The estate is a resettable test fixture (constraint 13), so
the cost of the window is presentation, not data.

**Cost.** Serialises two ceremonies that could otherwise overlap — an hour or two of wall clock, no lane time.

**If it is not ruled.** The soak's evidence is void, and S22's irreversible Pages delete is gated on a reading
that measured a reset rather than the Worker.

---

### D5 · The soak window — how long, and what is watched.

**Question (en).** No soak duration exists anywhere in the repo (§7 item 4) and no instrument is named, yet the
soak is the only thing standing between the reversible repoint and the irreversible Pages delete — what number,
and what is observed during it?

**问题（大白话）.** 域名搬过去之后、删掉旧项目之前，要「观察一段时间」。仓库里没有写要观察多久，也没写要看什么。请老板给一个
数字（建议 24 小时），并且同意观察的内容是：定时打一次首页和 `/ready`、窗口结束时重走一遍路由、看一眼错误日志。

**Recommendation: 24 hours, with three named observations recorded in the as-run** — a periodic reachability
read (`curl -sI https://app.clarabook.com` at open, mid-window and close, with the status and the served
`server`/`cf-ray` headers), one abbreviated route re-walk at the window's close (the entry routes plus one
`(firm)` page, stated as abbreviated), and one read of the Worker's error/exception count in the Cloudflare
dashboard's observability view for the window. Any of the three coming back other than clean stops S22.

**Cost.** A day of calendar time between the repoint and the delete. Nothing blocks on it — FS-11 and the launch
sitting can be prepared in parallel, subject to D4.

**If it is not ruled.** S22 runs on a soak that nobody measured, and the one irreversible act in this ceremony
loses its precondition.

---

### D6 · The preview walk and Supabase's redirect allowlist — widen, or walk password-only.

**Question (en).** The redirect allowlist is ruled to contain **exactly** `<origin>/auth/confirm` and
`<origin>/auth/recover` with no wildcard (`wave-g-setup-checklist.md:151-156`) — do we temporarily widen it so
the signup-confirm and password-recover arms can be walked on the `workers.dev` preview, or do we walk the
preview with password login only and prove those two arms on the real origin?

**问题（大白话）.** 预览网址（workers.dev）要不要临时加进 Supabase 的跳转白名单？白名单被规定成「只有两条、不许通配符」。加进去
才能在预览上走「注册确认」和「找回密码」；不加就只能在预览上用密码登录走查，那两条留到真域名上再验。

**Recommendation: walk the preview with password login only; prove the confirm and recover arms on the REAL
origin at S19.** Constraint 14's operative clause is that the product's security mechanisms are never weakened
for testing convenience, and the allowlist is one of them; the origin does not change at cutover (it stays
`app.clarabook.com`), so those two arms need no allowlist edit at all if they are walked after the domain moves.

**Cost.** Two journeys move from the preview to the real origin, i.e. they are proven *after* the DNS change
rather than before — accepted, because the rollback at that point is still a repoint, not a restore.

**If it is not ruled.** Either the walk quietly widens a ruled-narrow security list with no step to narrow it
back (the shape S19a now exists to prevent), or the two arms are never walked at all and their first exercise is
a real beta applicant.

---

### D7 · The invite link's `?ct=` edge-log redaction — a gate now, or a recorded deferral.

**Question (en).** The Wave-G checklist requires the invite link's `?ct=` query VALUE to be redacted in the
edge/access log, proven by hitting a live invite link and reading the log (`wave-g-setup-checklist.md:140-145`)
— this ceremony is where the edge changes owner from Pages to a Worker, so is that redaction configured and
proven here, or explicitly deferred and recorded?

**问题（大白话）.** 邀请链接长这样：`/invite/<token_hash>?ct=<clara_token>` —— **两个凭证都在网址里**：路径里一个，问号后面
一个。清单要求问号后面那个在边缘访问日志里被打码，并且要真的去打一次链接、翻日志证明。这次仪式正好是「边缘」从 Pages 换成
Worker 的时刻。所以：**现在就配好并证明，还是写清楚延后**？（另外要注意：清单只管问号后面那个，路径里的那个它没提。）

**Recommendation: make it an FS-10 step (S14a) with the checklist's own proof shape, and if the Cloudflare
account offers no zone-level query redaction for this Worker, record an explicit dated deferral naming the
exposure — never a silent skip.** Whether Cloudflare exposes such a control on this plan is **not measured**
(the repo names only the obligation and its proof, §7 item 10), so the step's first act is to look, on screen.
And state the observation the checklist does not: redacting `ct` alone still leaves the *other* bearer factor —
the `token_hash` path segment (`apps/web/lib/identity/doors.ts:59,80`; `lib/members/invite-mail.ts:10,97`) — in
the log line, so "redacted" here means one of two factors, not the link.

**Cost.** Fifteen minutes of dashboard reading, plus one live invite link burned for the proof.

**If it is not ruled.** A launch-blocking checklist line silently changes owner at the cutover and is ticked by
nobody, with plaintext bearer material sitting in ingress logs.

---

### D8 · The small pre-ceremony configuration PR — `wrangler.jsonc` `vars` + the four missing `.env.example` names.

**Question (en).** `apps/web/wrangler.jsonc` declares no `vars` block, so the Worker's non-secret configuration
would live only in the Cloudflare account, and `apps/web/.env.example` (125 lines, nine names) carries none of
the four FS-4 C-6 variables the checklist requires — does a small docs/config PR land before the ceremony, or
does the configuration stay account-only with a truing line?

**问题（大白话）.** 两个小毛病：新版网页的 Worker 配置文件里没有 `vars` 段落，所以「非密钥」的配置只存在 Cloudflare 后台、
代码库里查不到；而且 `apps/web/.env.example` 里少了 FS-4 新加的四个变量名（pepper、trusted-IP 头、服务令牌、Stripe 密钥）。
要不要在仪式之前先合一个小 PR 补上？

**Recommendation: yes — one small PR before S5, adding a `vars` block for the non-secret names and the four
missing names to `apps/web/.env.example` with comments (values empty, as that file's convention is).** The
`NEXT_PUBLIC_CLARA_RUNTIME_URL` incident (`docs/ops/incident-2026-07-26-intake-storage.md:41-56`) is exactly the
punishment for configuration with no repo-visible record. It can ride D1's PR.

**Cost.** Under a lane-unit; it rides D1's code PR and its review.

**If it is not ruled.** S7's name list has no authority in the repo to check itself against — `.env.example`
would positively *disagree* with the checklist — and a missing non-secret var on the Worker looks like nothing
until a request fails.

---

## 0 · The recipe, and where each half of it lives

| What | File |
|---|---|
| The cutover order (the base) | `docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md` §P6-X, lines 414-469 |
| The cutover order (the amendments that GOVERN) | `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md` §FS-10, lines 455-479 |
| The two exit gates | `docs/plan/active/fe-train-plan-2026-08-30.md` §5.2, lines 388-415; OQ-5 at :456-458 |
| The Cloudflare box + the env-var boxes | `docs/ops/wave-g-setup-checklist.md` lines 204-217 (Cloudflare/FS-10), 89-138 (env vars), 140-145 (`?ct=` redaction), 147-178 (signup gate) |
| The 11-line security cutover checklist | `docs/plan/active/security-pass-2026-09-02.md` §"The cutover checklist (C)", lines 541-593 |
| The capability precondition (裁-121①) | `docs/plan/active/dashboard-web-capability-diff-2026-09-02.md` |
| The build/deploy shape, env vars, security obligations | `apps/web/README.md` §Cloudflare :137-166, §Run :168-198, §Security posture :250-475 |
| The lane laws that bind an `apps/web` change | `apps/web/AGENTS.md` |
| Ceremony house practice (green sweep first, as-run, positive reads) | `docs/ops/ceremony-practices.md` §1 |
| The prior ceremony's shape (the model for this record) | `docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md` |
| **The rulings that govern this afternoon** (not yet all in the repo — truing-4 carries them) | 裁-126 · 裁-142…150, in the session's ruling records; 裁-148 re-cuts the checkout-walk line, 裁-146 the Mail gate, 裁-147 the Stripe-problem line, 裁-150 closes the session after the e2e |

**There is no Cloudflare Pages / Workers / DNS / rollback runbook anywhere under `docs/ops/`** — see §7.

**A standing ruling that overrides repo text in this record's area — 裁-126 + 裁-148.** Stripe stays in the
**BELCORT SANDBOX for the whole beta**: `STRIPE_SECRET_KEY` on `clara-web` is the TEST/sandbox key, the beta
price is MYR 0, and the checkout walk happens **once at the seeded beta price in sandbox**. Any repo text saying
Stripe switches to LIVE at the launch sitting, or demanding a **non-zero** test-price walk, is **SUPERSEDED** —
the non-zero walk belongs to the separate real-money switch ceremony (裁-125/126), and there is **no temporary
"make a priced plan current" OPS act at Wave-G** (裁-148 point 2). Three repo texts still say the old thing and
are filed as truing lines in §8: `docs/ops/wave-g-setup-checklist.md:129` and `:190-193`,
`docs/plan/active/checkout-gate-design-part3.md:180`, and
`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:487`.

---

## 1 · Preconditions — every one a POSITIVE READ, never an assumption

Law 2 of the three review laws (`AGENTS.md:156-159`): absence is not evidence, and a derived state is not
evidence. Each line below names the instrument that produces the read. **Nothing here may be satisfied from
`PROGRESS.md`'s banner** — measure from the tree or from `gh`.

### 1.1 On `main`

| # | Precondition | Instrument (the positive read) |
|---|---|---|
| P1 | The ceremony runs **from merged `main`, never a branch** (`orders-p6.md:436`, `AGENTS.md:235`). | `git fetch && git merge --ff-only origin/main; git log -1` — record the sha in the as-run. |
| P2 | A full manual-dispatch CI sweep against that tip is **ALL-GREEN**, closed-wave drills included (`ceremony-practices.md` §1: "A ceremony never opens on a red sweep"). | `gh workflow run ci.yml` then `gh run view <id> --json jobs` — read the **job list**, never a PR's colours (`AGENTS.md:230`). **Measured 2026-09-03 18:45 MYT:** the newest all-green dispatch sweep is run **`33723755257`** on **`60f4eaf5`**, 13/13 jobs `success`, 2026-09-03 06:33Z. That tip is **nine commits behind `5eab358d`**, and one of the nine is **`aa789d65` (#517), a CODE merge landed at 09:02Z — after that sweep** — so #517's code has never been through a full sweep and a fresh dispatch is **owed, not optional**. (The push run on `5eab358d`, `33742979788`, is green but **skipped** `build`, `db-estate`, `db-live-gates`, `closed-wave-drills`, `db-slice-frontiers`, `render-drill` and `db-split-partition-total` by path classifier — a docs-only classification, and NOT the sweep P2 asks for.) |
| P3 | **Exit gate 1 — the verb-coverage census re-run against a LIVE CATALOG on a throwaway rig** (`fe-train-plan-2026-08-30.md:391-400`). The standing census is pinned to `0138`; families minted `0149`–`0155` have never been measured by it, and `0156`…**`0164`** have landed since. **Migration-text greps do not substitute** (revokes make them unreliable). | Throwaway rig per `packages/db/README.md` (`pnpm db:migrate`, `pnpm db:seed`), then a live `pg_proc`/grant read for the denominator. **Pass = zero CUTOVER-OWED, zero un-dispositioned ORPHAN in direction 1; direction 2 still 100%.** Re-use `docs/plan/active/verb-coverage-census-2026-08-31.md` and heed its two Direction-2 traps (`:41-48`: `lib/registers/aging.ts:76`'s ternary verb, and `journal_lines` reached only through `lib/journals/api.ts:102`'s `fetchBounded` wrapper). **Re-derive the migration ceiling from `ls packages/db/migrations/ \| tail -1` at ceremony time** — it was `0164_checkout_gate_c6_web_reads.sql` on `5eab358d`. |
| P4 | **Exit gate 2 — the NotBuiltNote sweep, DERIVED FROM THE LIVE app TREE** on the routes-suite pattern (`fe-train-plan-2026-08-30.md:401-409`; `orders-p6.md:430-435`). A hand-kept list is the STALE-NOT-BUILT class arriving through the back door. | Enumerate every note on disk, resolve each against the lane it names, fail on any whose lane merged. Pattern to copy: `apps/web/lib/command/routes.test.ts` (reads the tree, carries a vacuity control). Known starting population **ten** surfaces (plan §5.2) — that number is a check on the derivation, never a substitute for it. **CORRECTED:** the earlier draft said #517's `pending-a11y.test.tsx` copy-rule change "is NOT on `main` yet". It **IS** — #517 merged as `aa789d65` at 2026-09-03 17:02 MYT (`gh pr view 517` → `MERGED`, `mergedAt 2026-09-03T09:02:02Z`), an ancestor of `5eab358d`. Re-read the rule from `apps/web/AGENTS.md` at the tip; every note this gate resolves must be resolved against the merged rule. |
| P5 | **Exit gate 3 — the a11y set at FOUR gates**: contrast (strict), rule engine, keyboard walk, target size, every `--target-min` exception visible and reasoned. | `pnpm --filter @clara/web lint` (runs `check-token-contrast.mjs` + `check-test-manifest.mjs`) and `pnpm --filter @clara/web test`; the rule engine is `apps/web/test/a11yRules.ts` (hand-written, deliberately **not** axe-core). |
| P6 | **Exit gate 4 — the 61-suite classification table** for `apps/dashboard`'s test files, each into exactly one of superseded (**naming the equivalent**) / migrated / retired-with-the-surface / owner-ruling-needed (`orders-p6.md:439-449`). "Superseded" naming no equivalent **is not evidence**. | Count first: `apps/dashboard` is stated as 217 TS files of which 61 are tests — **re-count it** (`apps/dashboard/package.json`'s `test` script enumerates the suites in one line). Table goes in the PR body. |
| P7 | **OPS.x (裁-121②)** — the Workers deploy of `apps/web` carries a parts union ⊇ the serving runtime's emittable kinds. | `node packages/runtime/scripts/check-parts-parity.mjs` (the CI gate at `.github/workflows/ci.yml:352`). Declarer of record is `packages/runtime/workflows/chatTurn.v16.parts.ts` (`check-parts-parity.mjs:24`); re-read whether a `chatTurn.v17.parts.ts` exists (`ls packages/runtime/workflows/chatTurn.v1*.parts.ts`) rather than inferring it — 裁-121② requires the re-check at every `_vN` bump. The runtime SERVING today is machine version 71 / `chatTurn_v17` — **read it from `fly status -a clara-runtime`, not from `PROGRESS.md`.** |
| P8 | **The interview runner has an `apps/web` home** — a HARD acceptance line (裁-78; `orders-p6.md:468`, FS-10 order `:459`). | Measured on `5eab358d`: `apps/web/lib/interview/api.ts` exists and addresses the runtime **through the same-origin proxy** at `:281`, `:302`, `:323`, `:377`, `:433` (`/api/runtime/interview/…`). Walk it in S12. |
| P9 | **裁-121① — the dashboard→web capability diff exists and its dispositions are honoured.** | `docs/plan/active/dashboard-web-capability-diff-2026-09-02.md` (pinned at `96b2ef61`): ~85 SAME, 7 DROPPED-UNRECORDED, 1 SUPERSEDED-PENDING-BUILD (`create_firm` → `claim_paid_firm`), 2 HONEST-NOTE, 3 DASHBOARD-ONLY-BY-DESIGN. 裁-130 rules the inline clarify answer + the composer attachment **IN for beta**; confirm those two landed **by reading the tree**, before the delete, or the cutover drops a ruled-in capability. |
| P10 | **The owed documentation line (R-3), RE-SCOPED.** `orders-p6.md:461-464` names two. **Measured 2026-09-03: only ONE is still owed.** | `grep -rn "verify_snapshot" docs/ops/` → **five hits, already paid**: `docs/ops/DR.md` **§11** (`:452`, heading "Period-snapshot drift check — `clara.verify_snapshot` (owner-ruled DR line)"), whose own header at `:455-459` states it IS that owed line, written 2026-08-29. **Do not re-file it.** `grep -rn "record_notification" docs/ops/` → **zero**; that half — `record_notification`'s "verify-then-decide" outcome — is the only line S23 owes. |
| P11 | **FS-4 is CLOSED — measured from the tree and `gh`, never from `PROGRESS.md`'s banner** (which is stale until truing-4 lands). | `gh pr view 517 --json state,mergedAt,mergeCommit` → `MERGED`, `2026-09-03T09:02:02Z` (17:02 MYT), merge commit **`aa789d65`**; `git merge-base --is-ancestor aa789d65 HEAD` → yes; `packages/db/migrations/0164_checkout_gate_c6_web_reads.sql` is on `main`; `apps/web/app/(entry)/checkout/route.ts` and `app/(entry)/checkout/success/claim/route.ts` are on `main`. Re-run all four at ceremony time. |
| P12 | **The chat/SSE origin fix (D1) has MERGED**, or the owner has ruled the fallback. | `git log --oneline -- apps/web/lib/clara/api.ts apps/web/lib/clara/stream.ts` shows the repoint commit on `main`, **and** `grep -n "NEXT_PUBLIC_CLARA_RUNTIME_URL" apps/web/lib/clara/api.ts` returns nothing (or, under fallback (a), `grep -n "CLARA_INTAKE_CORS_ORIGINS" packages/runtime/src/index.ts` shows the middleware lifted above `chatRoutes()`/`streamRoutes()` at `index.ts:94-95`). **Without this the ceremony does not open** — see D1 and §5 R1. |
| P13 | **裁-147 — no unhandled Stripe problem events before the cutover proceeds.** | Run `clara.list_stripe_event_problems(false)` (or a `select` on `clara.stripe_event_problems`) as the operator; the result must be EMPTY of unhandled rows, and any row is resolved through `clara.resolve_stripe_event_problem(uuid,text,text)` with its reason **before** S15. The operator SCREEN for these doors is ruled **post-beta** (裁-147 point 1), so this is a manual line by design. *(The checklist line that carries it rides truing-4 — until that merges, this record IS the line; §8.)* |

### 1.2 In the dashboards (Cloudflare / Supabase / Fly)

| # | Precondition | Instrument |
|---|---|---|
| P14 | **Cloudflare account access for the Workers deploy of `clara-web`** (`wave-g-setup-checklist.md:205`). | Owner act. Either the owner drives the dashboard, or a scoped `CLOUDFLARE_API_TOKEN` reaches the lead **env-to-env, never printed** (hard constraint 4/14). Read: `wrangler whoami`. |
| P15 | **What `app.clarabook.com` actually serves today — the cutover PR's FIRST act** (`orders-p6.md:456-460`; plan OQ-5 `:456`). *"Check the deploy record, do not derive it… absence of a Workers deployment record is not evidence of a Pages one."* | Cloudflare dashboard → **Workers & Pages → `clara` → Deployments** (newest deployment, its commit + branch + timestamp); and `wrangler pages deployment list --project-name clara`; and the DNS record for `app.clarabook.com`. Every repo claim that Pages serves the OLD dashboard is the claim being **verified**, not the evidence. |
| P16 | The **Pages project `clara` builds on every PR and every push to `main`** (measured 2026-08-31, FS-10 order `:472`). | Cloudflare → `clara` → Settings → Builds & deployments; and the deployments list showing builds keyed to recent docs merges. |
| P17 | The runtime is up and serving the expected version. | `fly status -a clara-runtime` → the machine id, VERSION and checks read live; `GET /health` 200, `GET /ready` true. Take the version from `fly`, not from a document. |
| P18 | **Supabase Auth → Redirect URLs** contains exactly `<origin>/auth/confirm` and `<origin>/auth/recover`, **no wildcard** (`wave-g-setup-checklist.md:151-156`). The origin does not change at cutover (it stays `app.clarabook.com`) — so this needs no edit at all under D6's recommendation. | Supabase Dashboard → Authentication → URL Configuration; the receipt is the Management API read `GET /v1/projects/{ref}/config/auth` (`apps/web/README.md:396-403`). Re-read at S19a as a close-out. |
| P19 | **The *Reset password* template stays a LINK template, UNCHANGED.** | Supabase → Authentication → Email Templates → *Reset password*: it must still emit a link, because `/auth/recover` spends a `?code=` (`apps/web/app/(entry)/auth/recover/password/page.tsx`; `docs/ARCHITECTURE.md:105`). Read it back through the Management API, not a screenshot. **The rule now HAS a repo home** — 裁-146 wrote it into `docs/ops/wave-g-setup-checklist.md:49-54` ("the *Reset password* template stays a **LINK** template, UNCHANGED… a bare token would dead-end it"). What is still homeless is the **BOX** (the tickable line): `:52-53` and `:155-156` both park it in "the pending FS-10 notes", which is not a document. **This record is that box until §8's truing line gives it a permanent one in the checklist's Signup-gate section.** |
| P20 | **The security pass's 11-line cutover checklist** is walked before the deployed origin serves `/signup` at all (`security-pass-2026-09-02.md:541-593`). | Ticked line by line in the as-run. **Lines 3, 4, 5 and 7 are explicitly DEFERRED per D3, each pointed at a numbered FS-11 step** — a deferral that is written down, never a tick. |
| P21 | **HTTPS on the deployed origin** (checklist line 11). `__Host-clara-auth` and `__Host-clara-confirm-flash` are dropped silently over plain HTTP with no error at any layer. | Both the workers.dev preview and a Cloudflare custom domain are HTTPS; the read is the cookie actually landing after a login (DevTools → Application → Cookies). |
| P22 | **The Mail gate (裁-146).** Custom SMTP → Resend was configured ≈16:08 MYT 2026-09-03 and delivery to a NON-team address was proven ≈16:55 via a Supabase *Invite user* mail (`wave-g-setup-checklist.md:55-62`). | **What is still OWED at the walk, and is a LAUNCH GATE, not a wording item:** a real **/signup six-digit confirmation** sent through the custom SMTP to a non-team address, arriving within about a minute and verifying on the confirm page (裁-146 point 3; checklist `:76-84`). The Invite-user proof does **not** certify it — different template, and it carried a link where the confirmation arm must carry a code. Also read back, at the walk: the raised auth rate limit (its number was never stated) and that *Confirm signup* still emits `{{ .Token }}` — both by Management API, not screenshot. **This gate belongs to FS-11/the Wave-G walk, not to FS-10** — FS-10 only records that it is outstanding, and S12 proves the deployed `/signup` refuses honestly in the meantime. |

---

## 2 · The step list

Actor key: **[O]** = owner act (Cloudflare/Supabase account authority, or a secret value) · **[L]** = lead
(the agent, as the owner's delegate through the real audited doors, constraint 14) · **[O/L]** = either,
depending on whether a scoped API token has been handed over env-to-env.

### Phase A — settle the ground (no mutation)

**S1 [L] Pin the tip and open the as-run.**
`git fetch && git merge --ff-only origin/main && git log -1 --format='%H %s'`
→ *Read:* the sha recorded as the ceremony's base in the as-run file (which lands in `docs/plan/completed/`,
FS-10 order `:475`).

**S2 [L] Dispatch and read the CI sweep.**
`gh workflow run ci.yml` → `gh run view <id> --json jobs -q '.jobs[] | "\(.conclusion)\t\(.name)"'`
→ *Read:* every job in the job list green — 13 of 13 on the shape measured 2026-09-03 (`lint`, `changes`,
`closed-wave-drills`, four `db-slice-frontiers` legs, `render-drill`, `db-live-gates`, `build`, `db-estate`,
`db-split-partition-total`, `ci`). Red = the ceremony does not open (`ceremony-practices.md` §1). A push run's
green is NOT this read (P2).

**S3 [L] Re-measure FS-4's closure and the tree facts P11–P13 name.**
→ *Read:* `gh pr view 517`, the `0164` migration on disk, the two checkout Route Handlers on disk, and the
D1 fix commit. Written into the as-run verbatim. **No claim in this ceremony is taken from `PROGRESS.md`.**

**S4 [O/L] The deploy-record check — the cutover's declared first act.**
Cloudflare dashboard → Workers & Pages → `clara` → Deployments; `wrangler pages deployment list --project-name clara`;
`wrangler pages project list`; the DNS record for `app.clarabook.com`.
→ *Read:* the newest Pages deployment (id, commit, branch, timestamp) and the hostname's current target,
written verbatim into the as-run. **Do not derive this from any document.**

**S5 [L] Run the four exit gates (P3–P6) and OPS.x (P7).**
→ *Read:* each gate's own output attached to the PR (`orders-p6.md:467`), the 61-suite table in the PR body,
`check-parts-parity.mjs` exit 0 with its census printed.

### Phase B — stop the old app rebuilding (first mutating act, and it is reversible)

**S6 [O] Disconnect the Pages project `clara`'s Git integration — BEFORE the Workers deploy and BEFORE the DNS change.**
Cloudflare dashboard → Workers & Pages → `clara` → **Settings → Builds & deployments → Git integration → Disconnect**.
*Why first:* the project builds on every PR and every push to `main`, so until it is disconnected **every docs
merge re-deploys the OLD dashboard** (FS-10 order `:470-473`; `wave-g-setup-checklist.md:206-210`).
→ *Read:* the project's Settings page shows no connected repository, **and** a subsequent push to `main`
produces **no new deployment** in the deployments list. (A disconnect does not unpublish: the last successful
build keeps serving — which is exactly what makes the rollback in §3 possible.)

### Phase C — build the Worker artifact (on Linux)

**S7 [L] Build on WSL/Linux with Node ≥ 22.**
```sh
# WSL, Node >= 22 (wrangler's floor; the repo root pins Node 20 — FS-10 order :467)
pnpm install --frozen-lockfile
# build-time env, exported into the shell, never committed:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY  (inlined into the browser bundle)
#   NEXT_PUBLIC_CLARA_RUNTIME_URL  — under D1's recommendation this variable is GONE from the
#     chat lane and is set to NOTHING; if the owner rules fallback (a), it is set here and frozen
#     into the bundle (see R6).
#   CLARA_E2E_MONEY_INPUT_HARNESS / CLARA_E2E_ROUTE_ERROR_PROBE  MUST BE UNSET
pnpm --filter @clara/web cf:build
```
`cf:build` = `check-public-key.mjs && opennextjs-cloudflare build` (`apps/web/package.json:16`). The key gate
**refuses to bundle** unless the anon slot holds a publishable/anon key (`apps/web/README.md:194-197`).
*Known-and-expected:* this step fails **reproducibly on Windows/Node 20.19.5** inside
`buildExternalNodeMiddleware` → `copyTracedFiles` with `ENOENT … middleware.js.nft.json` — an environment
mismatch, **not** a regression (`apps/web/README.md:152-163`).
→ *Read:* exit 0; `.open-next/worker.js` present; the **Worker ≤ 10 MiB compressed** (FS-10 order `:468`) —
take the size from wrangler's own upload output in S10, and record it; a grep of `.open-next/` confirming the
`(e2e)/money-input-harness` route compiled to its inert 404 stub (`apps/web/next.config.ts:26-45`); and a
leak-discipline grep of `.open-next/assets/` for any `service_role`/`sb_secret` string (must be zero — the
service-role key is server-only).

**S8 [O] Put the Worker's environment on `clara-web`, env-to-env — and MINT the two shared values here (D2).**
```sh
wrangler secret put <NAME> --name clara-web     # once per name; the value is typed/piped, never printed
wrangler secret list --name clara-web           # the receipt (names only, values redacted)
```
Names owed (`wave-g-setup-checklist.md:89-138`; **note the source — `apps/web/.env.example` is NOT it**, see
below): `CLARA_PUBLIC_ORIGINS` · `CLARA_RUNTIME_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `RESEND_API_KEY` ·
`INVITE_MAIL_FROM` · `CLARA_RATE_WALL_PEPPER` · `CLARA_TRUSTED_CLIENT_IP_HEADER` = **`CF-Connecting-IP`** on
`apps/web` (the runtime's same-named variable takes **`X-Clara-Client-IP`** — different correct values,
`wave-g-setup-checklist.md:114-124`) · `CLARA_AUTH_WALL_SERVICE_TOKEN` · `STRIPE_SECRET_KEY`
(**TEST/sandbox for the whole beta — 裁-126/148; never a live key at this ceremony or the launch sitting**;
read by `apps/web/lib/checkout/stripe-session.ts:212` alone and never bundled).

**THE MINTING RULE (D2), stated so neither ceremony waits on the other.**
`CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN` are **MINTED ONCE, HERE, by the owner**, set on
`clara-web` env-to-env, and the **same two values** are carried to FS-11 **step 11**
(`fs11-wave-g-reset-prep.md:379-396`) for `clara-runtime`. **The hash-equality proof is DEFERRED to FS-11
step 11** — the runtime holds neither value until then (`fs11-wave-g-reset-prep.md:143-148`: v71 shipped with
every C-5 name absent, both routes 503 per request), so at FS-10 the comparison has one operand and the
instrument the checklist names (`:132-133`, "compare a **hash** of each value across the two environments")
**cannot run**. FS-10's read is therefore: the two names PRESENT in `wrangler secret list --name clara-web`,
plus a dated line in the as-run naming them as the minting values FS-11 step 11 must reuse verbatim. Running
the hash comparison at FS-10 against an absent runtime value would compare a hash to nothing and read as a
pass — the false-measurement class.

*Mechanism, verified in the installed adapter:* the OpenNext worker copies every Cloudflare `env` string —
`vars` **and** secrets — into `process.env` at init
(`apps/web/node_modules/@opennextjs/cloudflare/dist/cli/templates/init.js:87-92`), which is what
`lib/same-origin.ts:72`, `app/api/runtime/[...path]/route.ts:35`, `lib/rate-wall-courier.ts:73,76` and
`app/(entry)/auth/confirm/verify/confirmation-wall.ts:123-124` read.
*Two caveats already on record, both D8's subject:* `wrangler.jsonc` declares **no `vars` block**, so the
non-secret names have no declared home in the repo (`wave-g-setup-checklist.md:136-138`); and
**`apps/web/.env.example` is 125 lines carrying exactly NINE names** (`:34,35,60,71,92,97,107,116,125`) —
**none of the four FS-4 C-6 names is in it** (measured: `grep -n "RATE_WALL_PEPPER\|TRUSTED_CLIENT_IP\|AUTH_WALL_SERVICE_TOKEN\|STRIPE" apps/web/.env.example` → zero). So the checklist, not `.env.example`, is the
authority for this list, and D8's small PR is what makes them agree.
→ *Read:* `wrangler secret list --name clara-web` showing all nine names.

### Phase D — the preview walk, BEFORE any DNS change

**S9 [L] Upload a version without routing production traffic.**
```sh
pnpm --filter @clara/web exec opennextjs-cloudflare upload -- --preview-alias cutover
```
`opennextjs-cloudflare upload` runs `wrangler versions upload`
(`apps/web/node_modules/@opennextjs/cloudflare/dist/cli/commands/upload.js:32-36`); `--preview-alias` needs
wrangler ≥ 4.21.0 and the repo pins **4.126.0** (`apps/web/package.json`) — both confirmed against Cloudflare's
own docs (`developers.cloudflare.com/workers/configuration/previews`). A **version upload routes no traffic**,
which is precisely the "repoint first, prove, delete second" shape one step earlier.
*(There is no `cf:upload` script in `apps/web/package.json` — the `exec` form above needs no repo change.)*
→ *Read:* the command prints the version id and the preview URL; `curl -sI https://<preview>` → 200.

**S10 [L] Record the artifact size.**
→ *Read:* wrangler's upload output line for total/compressed size — **≤ 10 MiB compressed** or STOP.

**S11 [O/L] The origin wall — the UNSET probe FIRST, then the two configured arms.**
The checklist's own words (`wave-g-setup-checklist.md:95-99`): *"Confirm the courier **fails closed** (refuses
its own same-origin POSTs) when this is unset — do not just confirm it is set, confirm the fail-closed
behaviour under a deliberately-unset probe first."* Three arms, in this order:
