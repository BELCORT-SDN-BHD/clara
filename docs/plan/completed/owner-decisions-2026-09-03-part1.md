*Part 1 of 2 of the 23 owner ceremony decisions pack (2026-09-03), the input to 裁-151…173 — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: none (this is the first part) · Next: `owner-decisions-2026-09-03-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

# OWNER DECISIONS — the consolidated list across FS-10, FS-11 and the launch sitting

**Prepared 2026-09-03 ≈19:1x MYT, read-only.** No repo edit, no commit, no migration, no live DSN,
no rig, no secret printed. **NOTHING BELOW HAS BEEN RUN.**

**Source records (all three are the FOLDED pass 2):**

- `…/scratchpad/ceremonies/fs10-cutover-prep.md` — the P6-X cutover (D1…D8)
- `…/scratchpad/ceremonies/fs11-wave-g-reset-prep.md` — the reduced Wave G (D-1…D-5)
- `…/scratchpad/ceremonies/launch-sitting-prep.md` — the beta-live go/no-go (DECISION 1, DECISION 2,
  plus the owner's decision-shaped acts ③④⑤⑥⑩)

**Owner rulings read for this consolidation:** `…/scratchpad/truing/ruling-142.md` …
`ruling-150.md`, plus 裁-126 (`docs/plan/active/mohe-grill-rulings-2026-09-02.md:207-217`).
Anything those rulings settle is **NOT a decision below** — it is in §2, cited, so nobody re-opens it.

---

## −1 · THE RULINGS — all 23 decisions ruled 2026-09-03 ≈19:4x–20:5x MYT (shell clock), one per turn (AskUserQuestion); verbatim files `…/scratchpad/truing/ruling-151.md` … `ruling-173.md`

| OD | 裁 | Outcome (照建議 unless marked) |
|---|---|---|
| OD-1 | **151** | (b) the same-origin proxy — **PR #539 MERGED `9d5d844e` 20:48**; standing steer "最流暢和標準的做法；architecture 要有效率" |
| OD-2 | 151 | rode #539: `wrangler.jsonc` `vars` (three names) + four names in `.env.example` |
| OD-3 | **152** | the owner MINTS the pepper + the auth-wall service token ONCE at FS-10 S8; same bytes at FS-11 step 12; the hash compare THERE |
| OD-4 | **153** | the four security lines deferred EXPLICITLY to FS-11 steps 12/11/6/13; T-B (0161→0163) rides |
| OD-5 | **154** | no allowlist widening; preview = password only; confirm/recover on the real origin at S21 |
| OD-6 | **155** | S16: look for the `?ct=` redaction control first; configure + prove, or a dated explicit deferral |
| OD-7 | **156 — AGAINST** | **NO SOAK**: switch + delete the Pages project in the SAME sitting, gated by the real-origin re-walk S21 (three observations folded in); fix-forward on the Worker is the only rollback |
| OD-8 | **157** | no maintenance page; the as-run records the window — with 156, FS-10 and FS-11 run back to back |
| OD-9 | **158 — AGAINST** | the `apps/dashboard` SOURCE delete lands BEFORE beta live — lane `delete-dashboard` DISPATCHED (branch `web/p6-x-source-delete`); **merge gate = FS-10 S21 passed** |
| OD-10 | **159** | BELCORT re-minted through the self-serve door (route a); `is_operator` at step 14 |
| OD-11 | **160** | the canary's clara rows die with the schema — accepted, an as-run line at step 4 |
| OD-12 | **161 — AGAINST (Storage half)** | PURGE ALL auth users AND all Storage OBJECTS at a new FS-11 step 4b (after backup + restore-proof + reset; never buckets/policies); counts before/after |
| OD-13 | **162** | constraint 14 supersedes DR.md's owner-run line for steps 2/4/7 — FS-11 ONLY; expires at beta live with the data authority; crown jewels stay [O] |
| OD-14 | **163 — AGAINST** | the LOCAL `--profile full` dump restored by the lead + dr-verify subset + the post-restore ceremonies; the R2 decrypt + overdue monthly drill → a Known-issues row (owner) |
| OD-15 | **164 (+ addition)** | denominator = the eleven milestones + the product walk, honest count; **the product walk MUST exercise the agentic paths** (upload→reconciliation, chat as the execution surface, auto-post/auto-wake) |
| OD-15b | **165** | beta ships autonomy LAYER 1 only (the automatic draft belt + chat acts, human-disposed); LAYER 2 (G1 cadence sources) OFF — G1 PR-2 = Backlog before 上市 |
| OD-16 | **166** | DPA signature only at beta; the terms = Backlog with the lawyer pass; **PRD:290's "four live" is FALSE — three live + the terms as the not-yet-live fourth** (re-cut owed); document count answered (per firm 2 / per client 1 / per member 0) |
| OD-17 | **167** | "跟著 clarabook-frontend" = its SHIPPED component (24/28/32/36) is authoritative; §5.2 never implemented |
| OD-18 | **168** | the two design-repo recut PRs deferred — a dated Backlog row, the owner as actor |
| OD-19 | **169** | the two rate-limit numbers READ BACK by Management API at the walk; accepted as read; 裁-102 SUBSTITUTED |
| OD-20 | **170** | **BELCORT is NOT SST-registered** (stated); Stripe Tax OFF for beta on that fact |
| OD-21 | **171** | the twenty knowingly-open items accepted in principle, read item by item at the sitting; 裁-133/111 stay SUSPENDED |
| OD-22 | **172** | a replacement `4.9` subject named at the final truing, else UNPROVEN IN THE FIELD + a Known-issues row |
| OD-23 | **173** | the two PNGs DELETED (done); the locked shells + vhdx = the owner's elevated-shell acts at the pause window |

**The order under the rulings (replaces §4's diagram where they differ):** sweep 33757365379 on
`9d5d844e` GREEN → FS-10 A…D (preview walk, narrow `CLARA_PUBLIC_ORIGINS`, walled POSTs refuse BY
DESIGN, S14 streaming proof, S16 `?ct=` look) → FS-10 E: attach the domain → **S21 real-origin
re-walk incl. confirm/recover + the three observations** → all clean ⇒ **the Pages project delete
in the same sitting** (裁-156) → **merge the `apps/dashboard` delete PR + a hand sweep** (裁-158) →
FS-11 immediately (裁-157: a recorded window, no page): backup → the LOCAL restore-proof (裁-163) →
reset → **4b purges** (裁-161) → migrate 159 → ACL baseline → seed → nine evaluators → runtime →
stripe_object_map → the two LOGIN flips → the secrets + THE HASH COMPARE (裁-152) → the self-serve
walk mints BELCORT (裁-159) → is_operator → the corpus walk → **the product walk incl. the agentic
section** (裁-164/165) → the Mail certification → the two rate limits read back (裁-169) → close →
THE LAUNCH SITTING (裁-167…171; SST fact 裁-170) → beta live → THE CLOSE (裁-172/173) + the FINAL
truing (T-A…T-I) → 裁-150: the session ends.

---

## 0 · One thing changed since all three records were written — measure from HERE

All three preps were written against `main` **`5eab358d`** and each says 裁-147…150 are *"not in the
repo yet — truing-4 lands them"*. **Truing-4 has LANDED.** Measured in this session:

| Fact | Instrument (run 2026-09-03 ≈19:0x MYT) | Read |
|---|---|---|
| `main` is no longer `5eab358d` | `git log -1 --format='%H %s'` | **`f58e701e`** — *"docs(truing-4): afternoon truing — queue drained, two splits, 4 rulings (#538)"* |
| 裁-147 · 148 · 149 · 150 are IN the repo | `grep -rl "裁-14[789]\|裁-150" docs/ PROGRESS.md AGENTS.md` | all four hit `docs/adr/README-log.md`, `docs/adr/README-rulings-2026-09.md`, `docs/plan/active/mohe-grill-rulings-2026-09-03.md`, `PROGRESS.md`; 裁-147/148 also `docs/ops/wave-g-setup-checklist.md` |
| The digest split happened (R12 is closed) | `ls docs/adr/README-rulings-2026-09.md` | present — the 500/500 block on recording a new ruling is GONE |
| 裁-148's re-cut is executed in the checklist | `sed -n '188,196p' docs/ops/wave-g-setup-checklist.md` | `:190` now reads **"exercises checkout ONCE at the SEEDED BETA PRICE — Stripe sandbox, MYR 0 (re-cut by 裁-148…)"** — FS-11's truing line **T-2 is PAID; drop it** |
| FS-4 is closed and `PROGRESS.md` is no longer stale on it | `gh pr view 517` → `MERGED`, `2026-09-03T09:02:02Z`, `aa789d65`, 55 files; `git merge-base --is-ancestor aa789d65 HEAD` → true; `ls packages/db/migrations/*.sql \| wc -l` → **159**, tail `0164_checkout_gate_c6_web_reads.sql`; `sed -n '1,12p' PROGRESS.md` | the banner now says *"THE PAID-FIRM CHAIN FS-4 IS COMPLETE at `aa789d65` … frontier `0164`, 159 migration files"*. **The banner is one PR behind the tree (it names `5eab358d`), but it is CORRECT on FS-4.** Still: every state claim in a ceremony is measured from the tree or `gh`, never from the banner |

**Three repo texts still contradict 裁-126/裁-148 after truing-4** (the checklist's line was re-cut;
these were not) — filed as truing lines in §5:
`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:438` and **`:440`**
(*"switch Stripe to LIVE + the RM0 price at the launch sitting"*),
`docs/plan/active/checkout-gate-gate-record.md:372`,
`docs/plan/active/checkout-gate-design-part3.md:180`.

---

## 1 · THE DECISIONS — ordered by when they must be ruled

Each: the question in one sentence (English, then 大白话), the recommendation, the cost, and what
happens if it is not ruled. **OD-1 and OD-3 are LAUNCH BLOCKERS** — FS-10 does not open without them.

### A · BEFORE FS-10 (the cutover)

---

#### OD-1 · The chat and SSE origin — a code PR before the ceremony. **LAUNCH BLOCKER.** *(FS-10 D1)*

**Question (en).** `apps/web`'s chat and stream lanes are the only runtime callers still wired to a
build-time browser URL instead of the same-origin `/api/runtime/*` proxy that intake and the
interview runner already use — do we **(b)** repoint those two files at the existing proxy, or
**(a)** open a CORS allowlist on the runtime's chat and stream routes?

**问题（大白话）.** 新版网页里只有「聊天」和「实时流」两条路还在直接打 Fly 上的 runtime（跨域），文件上传和
访谈引擎早就改走同源代理了。测出来的结果是：**部署之后这两条路一定是坏的** —— 变量设了会被浏览器跨域拦掉，
不设就打到一个新版网页根本没有的地址。要么 (b) 改前端两三个文件走已有的同源代理，要么 (a) 在 runtime 那边开
跨域许可。两条都要改代码、都要在 FS-10 之前先合一个 PR。

**Recommendation: (b)** — repoint `apps/web/lib/clara/api.ts` (`runtimeBase()` at `:56-58` and the
five call sites `:116`, `:129`, `:138`, `:148`, `:172`), `lib/clara/stream.ts:240-242` and
`lib/clara/useClaraThread.ts:70-72` at `/api/runtime/*`. The proxy already carries these routes by
construction (no per-route allowlist — `app/api/runtime/[...path]/route.ts:28-32`, mapping at `:48`),
already sends the session credential (`lib/runtime/outbound.ts:123-131`, `:196-198`), already streams
the body through (`route.ts:116`), and already exports the verbs chat needs (`:153-155`). Option (a)
puts the Supabase JWT back on a direct browser→Fly wire and re-freezes a `NEXT_PUBLIC_*` value at
build time — the two shapes the 2026-07-26 intake incident and the 2026-08-27 review were about.

**Cost.** One small `apps/web` code PR under the full ADR-061 ladder (≈0.5 lane-unit + one opus
review), including the five suites that set `NEXT_PUBLIC_CLARA_RUNTIME_URL` and the e2e mock at
`apps/web/e2e/chat-parity-mock.mjs:209-211`. **One unknown it cannot settle:** whether a Route
Handler's streamed body survives OpenNext-on-Workers — FS-10 **S14** on the preview is the
instrument, and (a) is the standing fallback if the preview does not stream.
**If unruled:** the cutover ships an app whose chat and stream are dead on the real origin — the
product's highest-value surface — invisible until a human opens a thread, because the e2e harness
answers `/api/chat/*` from its own mock.

---

#### OD-2 · The small pre-ceremony configuration PR *(FS-10 D8 — rides OD-1's PR)*

**Question (en).** `apps/web/wrangler.jsonc` declares no `vars` block and `apps/web/.env.example`
(125 lines, nine names) carries **none** of the four FS-4 C-6 variables — does a small config PR land
before the ceremony, or does the Worker's configuration stay account-only with a truing line?

**问题（大白话）.** 两个小毛病：Worker 配置文件里没有 `vars` 段落，所以「非密钥」配置只存在 Cloudflare 后台、
代码库里查不到；`.env.example` 里也少了 FS-4 新加的四个变量名。要不要在仪式前先合一个小 PR 补上？

**Recommendation: yes** — one small PR before FS-10's S5, adding a `vars` block for the non-secret
names and the four missing names (pepper · trusted-IP header · auth-wall service token ·
`STRIPE_SECRET_KEY`) to `.env.example` with comments, values empty per that file's convention. It
rides OD-1's PR and its review. Precedent: `docs/ops/incident-2026-07-26-intake-storage.md:41-56`.
**Cost.** Under a lane-unit; no separate review.
**If unruled:** FS-10's S7/S8 name list has no authority in the repo to check itself against —
`.env.example` positively *disagrees* with the checklist — and a missing non-secret var looks like
nothing until a request fails.

---

#### OD-3 · Who MINTS `CLARA_RATE_WALL_PEPPER` and `CLARA_AUTH_WALL_SERVICE_TOKEN`, and where the equality read runs. **LAUNCH BLOCKER.** *(FS-10 D2 = FS-11 P-17 / R-5)*

**Question (en).** FS-10 sets both on `clara-web` and FS-11 step 12 sets them on `clara-runtime`,
both saying "identical to the other's" and both proving it by a hash comparison across the two
environments — so which ceremony mints them, and where does the comparison actually happen?

**问题（大白话）.** 有两个必须「两边一模一样」的密钥（速率墙 pepper、认证墙服务令牌）。两份仪式记录都写着
「跟对面一样」，可是对面还没有——等于两边都在等对方先有。所以要定：**谁先造这两个值**？

**Recommendation: the owner MINTS both ONCE at FS-10 (S8), sets them on `clara-web` env-to-env, and
the SAME BYTES go to `clara-runtime` at FS-11 step 12.** The hash-equality proof is **DEFERRED to
FS-11 step 12**, the first moment the comparison has two operands — the runtime holds neither value
until then (v71 shipped with every C-5 name absent; both C-5 routes 503 per request). FS-10 records
instead: the two names present in `wrangler secret list --name clara-web`, plus a dated as-run line
naming them as the minting values FS-11 must reuse verbatim.
**Cost.** Zero extra work — a sequencing statement. Deferring both wholesale to FS-11 is also lawful
and free, but then `apps/web`'s `POST /checkout` refuses fail-closed on the deployed origin for the
whole window between the ceremonies, and FS-10's S12 read must say so.
**If unruled:** both ceremonies hold an instrument that cannot run
(`docs/ops/wave-g-setup-checklist.md:132-133` demands the hash comparison), and the likeliest outcome
is two peppers — one wall split in two, every confirmation 401ing, and nothing in either app's
configuration looking wrong.

---

#### OD-4 · Which security-pass cutover lines defer, and to WHICH FS-11 step number *(FS-10 D3, re-numbered against FS-11's folded step list)*

**Question (en).** The security pass's eleven cutover lines must all be ticked "before the deployed
origin serves `/signup` at all" (`docs/plan/active/security-pass-2026-09-02.md:541-593`), but lines
3, 4, 5 and 7 depend on acts the re-sequenced order places in FS-11 — do we ship FS-10 with those
four **explicitly deferred, each pointed at a numbered FS-11 step**, or move FS-11's relevant half in
front of the cutover?

**问题（大白话）.** 安全清单 11 条，规定「部署后的网址开始接客之前每条都要打勾」。其中 4 条靠的东西按现在的
顺序排在 FS-11。要么这次上线就**写清楚这四条是延后的、各自延到 FS-11 的哪一步**，要么把 FS-11 的那半提前。
不能装作已经打勾。

**Recommendation: defer, explicitly, with FS-11's FOLDED step numbers** — and note that FS-10's own
D3 text carries the pre-fold numbering, which is now off by one:

| Security-pass line | FS-10 D3 said | **Correct, against FS-11's folded step list** |
|---|---|---|
| 3 — trusted client-IP courier + pepper live, `originDigest` no longer `undefined` | FS-11 step 11 | **FS-11 step 12** (the C-5 secrets) |
| 4 — `clara_auth_wall_login` flipped to LOGIN + its DSN | FS-11 step 10 | **FS-11 step 11** (the two NOLOGIN→LOGIN flips) |
| 5 — `acl-baseline.sql` run on the live project | "no numbered step; insert one after step 5" | **FS-11 step 6 — the step now EXISTS** (folded in pass 2); read `ACL baseline verify: OK` (`packages/db/deploy/acl-baseline.sql:194`), the eleven-role roster `usage_public = f` (`:197-200`), and `clara_auth_wall` holding no `public` USAGE |
| 7 — DPA read repointed + the paid walk completed once | FS-11 step 12 | first half **already MET on the tree** (`apps/web/lib/registration/dpa-doors.ts:19` and `dpa-reads.test.ts:103` — the module consumes `clara.get_current_dpa_document()`, the retired relation read is gone); the walk half is **FS-11 step 13**, and 裁-148 re-cuts it to *one sandbox MYR 0 checkout*, not "a TEST-mode paid walk" |

**And one truing rides with it:** security-pass lines **4 and 5 both cite `0161`**, which is Q-D6
(`packages/db/migrations/0161_…sql:1-3`); the migration that mints `clara_auth_wall_login` is
**`0163_checkout_gate_c3_folded_door.sql`** (`grep -l clara_auth_wall_login packages/db/migrations/*.sql`
returns that file alone). A cutover line pointing at the wrong migration is law 3's exact shape.
**Cost.** One paragraph in FS-10's as-run and a docs truing line — no ceremony time.
**If unruled:** the four lines get ticked by nobody or ticked dishonestly, and step 6's ACL baseline —
the only thing that revokes `public` USAGE from the confined checkout-gate roles — falls between two
ceremonies again.

---

#### OD-5 · The preview walk vs Supabase's redirect allowlist — widen, or walk password-only *(FS-10 D6)*

**Question (en).** The redirect allowlist is ruled to contain **exactly** `<origin>/auth/confirm` and
`<origin>/auth/recover` with no wildcard (`docs/ops/wave-g-setup-checklist.md:151-156`) — do we
temporarily widen it so the signup-confirm and password-recover arms can be walked on the
`workers.dev` preview, or walk the preview password-only and prove those two arms on the real origin?

**问题（大白话）.** 预览网址要不要临时加进 Supabase 的跳转白名单？加了才能在预览上走「注册确认」和「找回密码」；
不加就只能在预览上用密码登录，那两条留到真域名上再验。

**Recommendation: walk the preview with password login only; prove confirm and recover on the REAL
origin at FS-10 S21.** Constraint 14's operative clause — the product's security mechanisms are never
weakened for testing convenience — and the origin does not change at cutover (it stays
`app.clarabook.com`), so those two arms need **no allowlist edit at all** if they are walked after the
domain moves.
**Cost.** Two journeys move from the preview to the real origin, i.e. proven *after* the DNS change —
accepted, because the rollback at that point is still a repoint, not a restore.
**If unruled:** either the walk quietly widens a ruled-narrow security list with no step narrowing it
back, or the two arms are never walked and their first exercise is a real beta applicant.

---

#### OD-6 · The invite link's `?ct=` edge-log redaction — a gate now, or a recorded deferral *(FS-10 D7)*

**Question (en).** The Wave-G checklist requires the invite link's `?ct=` query VALUE to be redacted
in the edge/access log, proven by hitting a live invite link and reading the log
(`docs/ops/wave-g-setup-checklist.md:140-145`) — the cutover is where the edge changes owner from
Pages to a Worker, so is that redaction configured and proven here, or explicitly deferred?

**问题（大白话）.** 邀请链接是 `/invite/<token_hash>?ct=<clara_token>` —— **两个凭证都在网址里**。清单要求
问号后面那个在边缘日志里被打码，而且要真去打一次链接、翻日志证明。这次仪式正好是「边缘」换主人的时刻：
**现在就配好并证明，还是写清楚延后**？（注意：清单只管问号后面那个，路径里那个它没提。）

**Recommendation: make it FS-10 step S16 with the checklist's own proof shape; if this Cloudflare
account offers no zone-level query redaction for the Worker, record an explicit dated deferral naming
the exposure — never a silent skip.** Whether such a control exists on this plan is **unmeasured** in
the repo, so the step's first act is to look, on screen. And state what the checklist does not: the
link carries **two** bearer factors (`apps/web/lib/identity/doors.ts:59,80`;
`lib/members/invite-mail.ts:10,97`), so "redacted" means one of two.
**Cost.** Fifteen minutes of dashboard reading plus one live invite link burned for the proof.
**If unruled:** a launch-blocking checklist line silently changes owner at the cutover and is ticked
by nobody, with plaintext bearer material in ingress logs.

---

#### OD-7 · The soak window — how long, and what is watched *(FS-10 D5)*

**Question (en).** No soak duration exists anywhere in the repo and no instrument is named, yet the
soak is the only thing standing between the reversible repoint and the irreversible Pages delete —
what number, and what is observed?

**问题（大白话）.** 域名搬过去之后、删掉旧项目之前要「观察一段时间」。仓库里既没写多久、也没写看什么。请给
一个数字（建议 24 小时），并同意观察内容：定时打首页、窗口结束再走一遍路由、看一眼 Worker 的错误计数。

**Recommendation: 24 hours, with three named observations in the as-run** — a periodic reachability
read (`curl -sI https://app.clarabook.com` at open, mid-window and close, recording status and the
served `server`/`cf-ray` headers), one abbreviated route re-walk at the close (stated as abbreviated),
and one read of the Worker's error/exception count in Cloudflare's observability view for the window.
Any of the three coming back other than clean stops the Pages delete.
**Cost.** A day of calendar time between the repoint and the delete; nothing blocks on it (FS-11 and
the sitting can be prepared in parallel, subject to OD-8).
**If unruled:** the one irreversible act in FS-10 runs on a soak nobody measured.

---

#### OD-8 · The FS-10 ↔ FS-11 posture — soak-first is agreed; the maintenance window is NOT *(FS-10 D4 vs FS-11 D-5 — the two records DISAGREE)*

**Question (en).** Both records agree FS-10's soak closes and is recorded before FS-11 opens, but
FS-10's D4 additionally says *"FS-11 runs inside a declared maintenance window regardless"* while
FS-11's D-5 says no window is needed because no beta user exists yet — so does the live origin carry
a declared maintenance posture while `clara` is dropped, or not?

**问题（大白话）.** 两份记录都同意「先把 FS-10 的观察期跑完写完，再开 FS-11」。但一份说 FS-11 期间要**挂维护
公告**，另一份说**不用**——因为这时还没有任何 beta 用户。要定的就是这一点：数据库被整个删掉重建的那段时间，
对外是挂公告，还是就让它报错、只在记录里写清楚起止时间？

**Recommendation: soak-first (both records agree), and NO maintenance page — a stated window
recorded in the as-run instead.** The reset is `DROP SCHEMA clara CASCADE` + a fresh apply of
`0001`…`0164` (159 files; `packages/db/scripts/reset.mjs:1,78`, and there is **no delta apply**), so
every route errors for the whole span; but the first invited firm signs up *after* this ceremony
(`docs/plan/active/frontend-sprint-handoff-2026-08-31.md:287-292`), so there is nobody to show a page
to, and a holding page is an unordered, unproven Cloudflare surface added at the worst hour. Record
the window's start and end timestamps and the expected errors instead.
**Cost.** Serialises two ceremonies that could otherwise overlap — an hour or two of wall clock, no
lane time. Choosing the maintenance page instead costs one extra Cloudflare surface to configure and
remove, each needing its own read.
**If unruled:** the two ceremonies run back to back by default; the soak's evidence measures the reset
rather than the Worker, and FS-10's cheap rollback quietly stops existing mid-FS-11 —
**rolling back to Pages after the reset restores the OLD app against a NEW database**, which is not a
rollback at all (`fs10-cutover-prep.md` §3, last row).

---

#### OD-9 · Does the `apps/dashboard` source-delete PR land before beta live, or become a Backlog row? *(FS-10 S24/S25 × 裁-150)*

**Question (en).** FS-10's last phase is a **separate** commit deleting `apps/dashboard` plus the
Pages project delete, both under the full ADR-061 ladder with the 61-suite classification table — but
裁-150 closes the session after the beta-live e2e with **no next lanes**, so does that PR land before
the sitting, or does it become a `PROGRESS.md` Backlog row with the owner named?

**问题（大白话）.** 切换完成之后，还要**另开一个 PR 把旧的 `apps/dashboard` 源码删掉**、并删掉旧的 Pages 项目。
可是裁-150 说 e2e 之后这个 session 就关了、不再开新 lane。所以：**这个删除 PR 在上线前做完，还是记进 Backlog
留给以后**？

**Recommendation: keep the repoint and the Pages retirement; DEFER the source delete to a dated
Backlog row naming the owner.** The sequencing law is *"repoint first, prove the Workers build serves
every route, then delete — a rollback after a repoint is a repoint; a rollback after a delete is a
restore"* (`docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md:450-454`), and nothing in it
requires the delete to happen *this week*. The delete PR is the heaviest remaining code lane (four
exit gates, a 61-suite table, a root `pnpm build` without `apps/dashboard`), it changes nothing a beta
user sees, and after FS-11's reset the old app cannot serve anyway.
**Cost.** `apps/dashboard` stays in the tree and in CI for the beta (build minutes, and a second app
that no longer matches the DB). Landing it instead costs one full-ladder code PR plus a hand sweep,
on launch night.
**If unruled:** the delete either rides the repoint commit — the one shape the sequencing law forbids
— or it is silently dropped with no Backlog row, which 裁-150 point 1 rules out.

---

### B · BEFORE FS-11 (the reduced Wave G)

---

#### OD-10 · How is BELCORT re-created after the reset? *(FS-11 D-1)*

**Question (en).** The reset deletes every firm including BELCORT — do we re-mint it by walking the
product's own self-serve signup+checkout door (route a), or by the heavier operator step (a
hand-made `clara.users` row + an unconsumed admission token + `create_firm`, route b)?

**问题（大白话）.** 重置会把 BELCORT 这家运营方公司也一起删掉。重建有两条路：走产品自己的注册＋付款那道门
（顺手把 beta 主流程也验了），还是走更重的「手工发准入令牌」那条路？

**Recommendation: route (a), the self-serve door.** It exercises the mechanism instead of working
around it (constraint 14's operative clause) and it *is* the sandbox round trip, so it costs no extra
step. The blocker that made this contentious is gone: FS-4 is closed (`aa789d65`) and the door is on
the tree (`apps/web/app/(entry)/signup/page.tsx`; `/signup` ∈ `PUBLIC_PATH_PREFIXES`,
`apps/web/lib/supabase/proxy.ts:62-72`). It also reorders `is_operator` to **after** the round trip
(FS-11 step 14, not step 8) — the g1 runbook refuses on zero BELCORT rows
(`docs/ops/g1-operator-firm-ceremony.md:93-109`).
**Cost.** Route (a) = zero extra acts. Route (b) = one hand-driven admission path beside the one under
test, plus a manual Supabase auth-user provisioning step
(`packages/db/scripts/onboard-rpr.mjs:295-298` calls it *"a manual dashboard step"*).
**If unruled:** FS-11 step 13 cannot open — the ceremony stalls after the reset with no operator firm,
and step 14 is unrunnable by its own precondition.

---

#### OD-11 · The parked S4-V2 canary's clara-side rows die with the schema — accept, or preserve? *(FS-11 D-2)*

**Question (en).** `DROP SCHEMA clara CASCADE` removes the canary's two clara-side rows
(`clara.agent_interruptions` `daba7f2e%`, `clara.agent_tasks` `032767e6%` —
`packages/db/scripts/dr-verify-checks.mjs:399,415`) while its `workflow.workflow_runs` row survives
under constraint 15, leaving an orphaned durable run and costing every future DR drill its STRICT
`4.9` parity subject — accept the loss on the record, or preserve the rows first?

**问题（大白话）.** 那个一直停着的 canary（`daba7f2e`），重置会删掉它在 `clara` 里的两行，而它在 `workflow`
里的那行会留下来——变成一条断了半截的记录，以后灾备演练里那一项检查也没对象了。接受并写进记录，还是先保下来？

**Recommendation: ACCEPT, as an explicit as-run line written at step 4, not later.** Constraint 11 is
about never *answering* the canary and never *approving* the witness; deleting test rows is neither,
and constraint 14 makes test data resettable. Preserving means hand-copying rows into a freshly
migrated schema — a second, un-drilled write path into audited tables — and the PreToolUse guard
(`scripts/hooks/pinned-ids-guard.mjs`) hard-blocks verbatim-id write shapes, so any preserve attempt
must be designed *around* the guard.
**Cost.** Accepting = one as-run line + OD-22's replacement subject. Preserving = an un-drilled write
path plus hook friction.
**If unruled:** step 4 runs and the rows are gone anyway — an undiscussed loss instead of a recorded
one, which is the failure this decision exists to prevent.

---

#### OD-12 · `auth.users` and Storage objects SURVIVE the drop — purge, or keep? *(FS-11 D-3)*

**Question (en).** The reset is schema-scoped: Supabase's `auth` schema has no FK from `clara` and
Storage bytes live outside Postgres entirely (`docs/ops/DR-full-drill.md:149-157`), so after the reset
every test account still exists in `auth.users` and every uploaded byte still sits in `firm-docs`
while the `clara` rows that gave them meaning are gone — purge the test auth users and the orphaned
objects, or keep them?

**问题（大白话）.** 这次重置只清 `clara` 这一层。登录账号表和文件仓库都不在这一层，所以重置之后：以前注册过
的测试账号还在、以前上传的文件还在，但它们在 clara 里对应的记录没了。要不要清掉？

**Recommendation: purge the TEST auth users (at minimum the address the walk will use), LEAVE the
Storage objects, both recorded.** A stale auth row silently kills the walk: `signUp` on an address
that already has an account is normalized to the *same* "check your email" state on purpose, as an
enumeration wall (`apps/web/components/entry/signup-account-form.tsx:185-194`) — so a reused address
produces a page that looks correct and a code that never arrives. Storage orphans are harmless to the
walk (fresh uploads write fresh paths) and deleting them is an irreversible act on a vendor surface
the repo has no runbook for; record the orphan count so DR probe `4.10` has an honest baseline.
**Cost.** Purging = an owner dashboard / Management-API act, a few minutes, irreversible for those
accounts. Keeping = the walk must use a never-before-used address, and `auth.users` accumulates dead
test rows across resets.
**If unruled:** if the owner reuses a registered address, step 13 dead-ends at "check your email" with
no error anywhere, and the Mail gate (裁-146 point 3) cannot certify.

---

#### OD-13 · Who runs the destructive commands — DR.md says OWNER, constraint 14 says the agent may *(FS-11 D-4)*

**Question (en).** `docs/ops/DR.md:397-402` puts *"any restore-into-a-project (needs
`CLARA_ALLOW_DESTRUCTIVE=1` + `CLARA_DESTRUCTIVE_TARGET=…`)"* in the **owner-run** column and says the
agent *"validates only on a throwaway PG17"*, while ADR-0075 / constraint 14 make this project's
estate test data the agent may reset — does constraint 14 supersede that line for steps 2, 4 and 7,
or does the owner run them personally?

**问题（大白话）.** 灾备手册写着「带毁灭性开关的操作业主亲自跑」，但后来的 ADR-0075（第 14 条）又说「测试数据
agent 可以随便删、随便重跑」。这两条撞了——重置和播种这两步，是我跑还是你跑？

**Recommendation: constraint 14 supersedes `DR.md:397-402` for THIS ceremony, in one recorded
sentence**, scoped to test data — the crown-jewel items beside it (reading any live secret, the R2
token, the `age` identity, `gh pr merge`) stay owner-run and are **not** superseded. The lead
therefore runs steps 2, 4 and 7; **every secret-bearing act stays [O]** (steps 11 and 12), which is
the half of the classifier that survives.
**Cost.** Ruling for the supersession = zero extra acts, one recorded sentence, one truing line so
`DR.md` says so. Ruling the other way = the owner personally runs three long piped commands in their
own POSIX shell, adding a session boundary inside a quiesce window.
**If unruled:** step 4 opens with the agent acting against a documented owner-run line — the exact
"the record never names the collision" failure this list exists to prevent.

---

#### OD-14 · Which bundle proves the restore before the reset — the fresh local dump, or the R2 bundle? *(FS-11 step 2b vs launch-sitting G3/G9 — the records DISAGREE)*

**Question (en).** The gate is *"confirm the backup completed **and is restorable** before the reset
proceeds"* (`docs/ops/wave-g-setup-checklist.md:263-265`) — is that discharged by restoring the
**freshly taken local `--profile full` dump** into a throwaway PG17 (FS-11 step 2b), or by the
**monthly-light recipe against the latest R2 bundle**, which needs the owner's `age` identity
(`docs/ops/DR.md:376-381`, `:431-436`) and is the only version that also discharges G9's overdue
cadence?

**问题（大白话）.** 重置之前必须证明「备份真的能还原」。有两种证法：把**刚刚打出来的本地那份**还原到一次性
数据库里（我可以做），或者把**云端 R2 上最新那份**用你手里的私钥解开再还原（必须你来，但顺便把已经**逾期约
43 天**的月度还原演练也补上）。选哪一种？

**Recommendation: the R2 bundle, as an [O] act, with the lead driving the restore and the
`dr-verify` subset afterwards.** It discharges two gates at once (the pre-reset restorability gate and
G9's monthly-light row, last run **2026-07-22**, `DR.md:404-415`), and it is the only path that proves
the **off-site** copy — *"the project itself is not a backup of itself"* (`DR.md:148`). If the owner
prefers the local dump, say so on the record and G9's overdue row stays overdue with a Known-issues row.
**Cost.** The R2 path costs one owner act (decrypt with the `age` identity, which is owner custody,
off-repo AND off-R2) and ~30-45 min. The local path is agent-only and faster, and proves less.
**If unruled:** the two records' instruments differ, the lead picks one, and the sitting later
discovers that the drill it counted twice was actually run once — or that the overdue cadence was
never discharged at all. *(R8: "the dump completed" is not "the dump restores".)*

---

#### OD-15 · The walk's denominator — "sixteen steps" is never enumerated *(launch-sitting R4 / FS-11 §12 item 10)*

**Question (en).** "The sixteen-step walk" is a **count** used in six places and enumerated nowhere:
the only lists in the repo name about **eleven** milestones
(`docs/plan/active/frontend-sprint-handoff-2026-08-31.md:287-291` and 裁-83) — do we accept those
eleven plus FS-11 step 16's product walk as the definition and record the honest count, or enumerate
five more before the walk?

**问题（大白话）.** 「十六步走查」这个数字被引用了六次，但仓库里**从来没有把十六步列出来过**——能找到的清单
只有十一个里程碑。要么就承认「走这十一步 + 老板自己的产品走查」，把真实数字如实记下来；要么走查之前先把
十六步列全。不列的话，这场走查等于自己给自己打分。

**Recommendation: accept the eleven enumerated milestones + step 16's product walk, and record the
honest count in the as-run** — never invent five to reach sixteen. The rubric's IT-2 demands an exact
assertion per acceptance cell; a count with no list cannot be failed, which means it cannot be passed
either.
**Cost.** One as-run paragraph and a truing line that re-cuts "sixteen" to the enumerated list
wherever it appears. Enumerating five more instead costs an owner sitting before the walk.
**If unruled:** the walk grades itself (R4), and "beta-ready as defined" is discharged by a number
nobody can check.
