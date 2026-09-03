*Part 2 of 3 of the launch-sitting PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `launch-sitting-prep-2026-09-03-part1.md` · Next: `launch-sitting-prep-2026-09-03-part3.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

   belongs to the real-money switch ceremony, together with a re-run of the sandbox round trip
   against the live account.
2. **A paid applicant who joined another firm strands their payment** (A-M4). `0163` adds the
   operator read `list_unconsumed_registration_payments()`; the operator **surface** that lists it
   is owed — until then it is reachable through the audited SQL door only.
3. **Runtime SSE re-authorisation on the poll tick** (B-M3): `assertTaskStreamAccess` runs once at
   open, so a removed member keeps a live transcript for up to 30 minutes.
4. **裁-102 is still OPEN** — `/signup`'s `supabase.auth.signUp` send path has no server-side wall of
   ours; accepting the rate limits as the wall means accepting **two named numbers in writing** (the
   Resend plan's cap and Supabase's raised auth rate limit), not the default mailer's
   (`security-pass-2026-09-02.md` item 6, re-cut by 裁-146). **The second number does not exist
   anywhere yet** — §4 owner act ⑤.
5. **The `token_hash`-in-logs and single-use-replay siblings** of the confirmation login-CSRF finding
   remain open on the same wiring PRs (`PROGRESS.md` Known issues, SECURITY row).
6. **DS-09** — per-field validation association: 2 rendered `aria-invalid` sites against 70
   `confirmDisabled=` occurrences across 49 files (`PROGRESS.md:375` — count the file, never the
   row); form-level errors still announce via `StateBanner`'s `role="alert"` (FS-9 row 9,
   non-gating).
7. **⌘K cannot reach a NAMED client from firm altitude** (FS-9 row 12) — ordered nowhere, post-beta
   by shape, and **said out loud rather than assumed**.

**Billing / checkout follow-ups, all before the real-money switch (裁-57)**

8. The deploy postverify guard `packages/db/deploy/extraction-slice-0022-postverify.sql:165-167`
   iterates a **hardcoded role list omitting all four checkout-gate roles**, so the "no machine role
   gains `clara_authenticated`'s reach" wall does not cover them by construction — derive the list
   from the catalog as `0154`'s census does.
9. **A DOOR refusal on the webhook path stores nothing today** — `stripe_event_problems.event_id`
   references `stripe_events`, so a refused event leaves no durable trace. Filed shape: a new
   sibling relation `clara.stripe_event_refusals`. *(This one has a first-hour consequence — §6.)*
10. **The C-2 operator screen is post-beta by ruling (裁-147)**, with the manual select standing in
    meanwhile — G7, and §6.2 in the first hour.

**Legal / design authority**

11. **The lawyer-reviewed DPA text is owed at LAUNCH** — beta ships the placeholder body; the real
    text publishes as a new version row, zero code change (裁-90). Same for the beta terms (裁-125).
12. **The beta terms' `kind` discriminator + per-kind partial unique index** ride the next DB PR
    touching the store; `sign_dpa`'s carrier gains `kind`; the signup step must present **both**
    documents with their own byte-identity hashes (裁-90 extends to the terms).
13. **The two `clarabook-frontend` recut PRs (裁-64② and R3 §9) are the OWNER'S** — DECISION 2 at the
    top of this record. The design law on that side drifts from the shipped app until they land.

**Engineering residue**

14. **The archived backend queue (裁-123)** — #447 · #448 · #452 · #456 · #449 · #460. Each branch
    carries its round as a WIP commit and each closed PR a resume note; map is
    `docs/plan/active/archive-parked-lanes-2026-09-02.md`. **Re-integration is post-beta, one lane
    each, from the resume note — never from memory.** #460's 裁-61 ruling (hard readiness failure)
    re-opens with it.
15. **`reconciler.mjs` still calls the dropped `reconcile_autopost_rules()`** and re-fires every
    poll, invisible in `beltErrors`. Not data-affecting; noisy and wrong.
16. **P6-1's bigint wire boundary** — `wake_freeform_read` emits `read_id` as a JSON number, so ids
    above 2^53 cannot render. `chatTurn_v16` fails closed. Fix queue 裁-71⑨, a D1 window.
17. **The `ninth-rowkind-seeding-proposal` capped-firm-wide-read flake** — a bounded lane and an
    estate-wide census of the same shape are owed; a cap invisible until the corpus grows past it
    is a time bomb in every sibling cell.
18. **The pool error contract is RULED and SCHEDULED, not open-ended (裁-149 = option C).** The
    general relay pool gains an `'error'` listener that logs, counts and raises a health flag on
    `/ready`; the **leader's dedicated `makeClient()` session stays CRASH-LOUD** so its loss releases
    the advisory lock and a standby takes over. **AFTER beta live**, as a product PR riding a v7x
    deploy, with the contract written into `docs/ARCHITECTURE.md`. Today's fail-loud behaviour is
    safe and stays until then. *(Not in the repo yet — `…/scratchpad/truing/ruling-149.md`;
    truing-4 lands the Backlog row.)*
19. **Locked worktree shells** — removal needs an elevated shell after a Claude Code restart, then
    `git worktree prune`. **None holds anything.** The three lists in the estate disagree on which
    they are — see §7.2, where the teardown census settles it by a walk.
20. **Two untracked PNGs in the repo root** + the vhdx compaction, both owner acts at the pause
    window (§7.2).

---

## 3 · DECISION 1's detail — the DS-07 measurement

**Where it is filed:** `docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md:59-65` ("The
decision note"), with the measurement at `:369-375`. `PROGRESS.md:375` carries the row.

**The question is NOT "re-map the cva".** It is **which artifact is authoritative**:

| Option | The values | What choosing it costs |
|---|---|---|
| **A — the token contract** | `--control-sm` · `--control-md` · `--control-lg` at **32 / 36 / 40 px** (`clarabook-frontend g5-design-system/docs/01-TOKEN-CONTRACT.md:142-144`) | Re-mapping `apps/web` alone **desynchronises** its size-variant block from the port it came from — the one thing Q1/Q4 forbid. The authority repo would need the matching recut: a **third** owner PR beside DECISION 2's two |
| **B — the shipped reference** | **24 / 28 / 32 / 36 px** in `apps/web/components/ui/button.tsx`, a block **byte-identical to the design authority's own** (md5 `6f29955ea9f9f080f7e602149d6a4aa6`) | The token contract's §5.2 stays unimplemented in **both** repos — the status quo, and the honest reading is that §5.2 was never implemented in either |

**Two facts the owner should have in hand:**

- §5.2 was **never implemented in EITHER repo**; the 2026-08-28 resource audit read §5.2 but
  extracted only its `--target-min` row (which became 裁-13) and never the `--control-*` rows. A
  genuine gap in that audit, **not a re-finding**.
- The **13 `size="xs"` buttons sit exactly on the SC 2.5.8 target-size floor with zero headroom** —
  裁-13's gate goes **green** on them, not red. Option A would give them headroom; option B leaves
  them at the floor, lawfully but with nothing to spare.

**Shape of the ruling:** the same kind as 裁-137 — *contract vs. reference*. Recorded per 裁-140 as a
**digest row plus a dated `README-log.md` line**, never a new ADR. **Note the mechanical
obstruction:** `docs/adr/README.md` is at **exactly 500/500 lines**, so the digest **must be split
before any new row lands** (`docs/plan/active/mohe-grill-rulings-2026-09-03.md:235`) — truing-4 owns
that split, and every ruling from this sitting queues behind it.

---

## 4 · The owner's acts at the sitting — what must be seen with the owner's own eyes

*These are IT-4 **V-OWNER** cells: an agent can never satisfy one. Bilingual, per the sitting's own
convention.*

### Act 1 — The Mail code · 邮件验证码

**EN.** On the deployed origin (`app.clarabook.com`, after the DNS move), **sign up** with an
address that is **NOT** a member of the Supabase project's organisation team. Watch the mail arrive
within about a minute. Read the **six digits** off it yourself, type them into the confirm card, and
see the account confirm. Then confirm with your own eyes that the mail carried **nothing to click**
— `{{ .Token }}`, not a link. *(This is the 裁-146 launch gate, and it is the ONE arm still owed: the
transport and sender were proven at ≈16:55 on 09-03 through the dashboard's **Invite user** arm,
which carries a LINK and is not the app's courier path. A screenshot of settings does not certify
it, and a mail to a team address does not either.)*

**中文（大白话）.** 用一个**不在 Supabase 项目团队里**的邮箱，在正式网址上**注册**一次。等邮件——大概一
分钟内应该到。你自己**亲眼把六位数字读出来**，输进确认页，看着账号确认成功。再确认一件事：那封信里
**没有任何可以点的链接**，只有数字。**这一条是上线的硬门槛。** 09-03 下午 16:55 那次已经证明了"信能发
到团队以外的邮箱"，但那是后台的**邀请信**（带链接），不是注册确认那条路——所以**注册这一条还欠着**。截
图不算，发到自己团队邮箱也不算。

### Act 2 — The sandbox round trip at the beta price · 沙盒里按 beta 价格走一遍

**EN.** In the Stripe sandbox account **"BELCORT 沙盒"** (`acct_1UAOhtHD90w0k86X`), complete the
checkout **the way a real beta customer will: at the seeded beta price, MYR 0, with no payment
details entered at all** — the plan row drives `payment_method_collection='if_required'` while the
amount is 0. Watch the whole chain: the checkout completes, the **signed webhook** arrives, the
**firm is born**. Then look at the invoice/receipt surface. *(裁-148: this is the ONLY checkout walk
at Wave-G. The non-zero-price walk belongs to the real-money switch ceremony, and there is **no
temporary "make the priced plan current"** act here.)*

**中文（大白话）.** 在 Stripe 沙盒账户 **"BELCORT 沙盒"**（`acct_1UAOhtHD90w0k86X`）里，按**真实 beta
客户**的走法走一遍：种下的 beta 价格、**MYR 0、整个过程一张卡都不用输**（金额为 0 时系统按 `if_required`
处理，Stripe 根本不收卡）。一路看下去：结账完成 → **带签名的 webhook 进来** → **事务所被创建出来**，最后
看一眼发票/收据那一页。**裁-148：Wave-G 只走这一次。** 非零价格那一次挪到"开真钱"那场仪式，今天**不要**
临时把有价格的方案切成当前方案。

### Act 3 — The "RM0" rendering rule · 客户看到的页面上不许出现 "RM0"

**EN.** Walk back through the surfaces you just passed and confirm the string **"RM0" appears
nowhere**: they must say "no fee is charged" and "trial" in words. *(裁-58 forbids "RM0" on any
customer-facing surface — it reads as "free", and beta is not free, it is unpriced.)*

**中文（大白话）.** 把刚才经过的每一页回头看一遍，确认上面**一个 "RM0" 字样都没有**：只能用文字写"不收
费""试用"。**为什么**：写 "RM0" 客户读成"免费"，而 beta 不是免费，是**还没定价**。

### Act 4 — The operator page after `is_operator` · 打开 operator 标志之后的运营页

**EN.** After the Wave-G reset has set BELCORT's `is_operator` flag as its own ceremony step, sign
in as a BELCORT **owner** and open **`/admin/registrations`**. See the operator navigation appear
and the registration queue render — including the paid-but-unclaimed registrations. Then sign in as
**anyone else** (a non-operator firm's owner, or a BELCORT admin) and confirm the entry is **not
there**: the door carries BOTH gates, the owner floor AND the operator-firm predicate. *(The flag is
flipped only by the raw owner-run one-shot ceremony `docs/ops/g1-operator-firm-ceremony.md` — never
an app screen, never an API, by design.)*

**中文（大白话）.** Wave-G 重置时会单独有一步把 BELCORT 的 `is_operator` 打开。打开之后，用 BELCORT 的
**owner** 账号登录，打开 **`/admin/registrations`**：应该能看到运营方的导航条目和注册申请队列，包括
"已付款但还没认领"的那些。然后换**别人**登录（别家事务所的 owner，或者 BELCORT 的 admin），确认这一项
**根本看不到**——这道门要同时过两关：owner 级别 **和** 运营方事务所。**这个标志只能由你本人跑那一次性
仪式 SQL 打开**，产品里没有任何界面或 API 能打开它，这是设计如此。

### Act 5 — The password-recovery arm · 找回密码那条路

**EN.** Two parts, and the first one is a **read, not a screenshot**. ① Through the **Management
API** (`GET /v1/projects/{ref}/config/auth`), confirm the *Reset password* template is **still a
LINK template, unchanged** — it must NOT have been switched to a bare token, because `/auth/recover`
spends a `?code=` through `exchangeCodeForSession` and a code-only mail dead-ends there
(`docs/ops/wave-g-setup-checklist.md:49-54`; FS-10 prep P16 `:69` / A9 `:351-352`). ② Then **walk it
once on the real origin**: request a password reset, receive the mail, **click the link**, land on
`/auth/recover`, set a new password, and sign in with it. *(This box has been parked in "the pending
FS-10 notes" — a document that does not exist — since the checklist was written. The walk is its
permanent home.)*

**中文（大白话）.** 两件事，第一件是**读回来**、不是截图。① 用 **Management API** 读一次
（`GET /v1/projects/{ref}/config/auth`），确认"重设密码"的邮件模板**还是带链接的那一版、没被改**——不能
换成只有数字的那种，因为 `/auth/recover` 要靠链接里的 `?code=` 才能换出会话，只给数字这条路就断了。②
然后在**正式网址上真的走一遍**：申请找回密码 → 收到信 → **点链接** → 落到 `/auth/recover` → 设新密码
→ 用新密码登录进去。*（这一格一直被挂在"FS-10 待办笔记"里——而那份文件根本不存在。这次走查就是它的
永久归宿。）*

### The owner's other acts at the sitting (decisions, statements and console work — not own-eyes proofs)

**EN.** ① Rule **DECISION 1 — DS-07** (§3). ② Rule **DECISION 2 — the two `clarabook-frontend` recut
PRs**: open now, or defer with a dated Backlog row. ③ **Acknowledge in one line** that 裁-133 and
裁-111 stay suspended and are decided at the next session's start (裁-150 point 2). ④ Confirm the
three **REPORTED** Mail items are read back — and **state the raised Supabase auth rate-limit
number**, which no document records. ⑤ Accept in writing the **two rate-limit numbers** that stand in
for 裁-102's missing server-side wall (the Resend plan's cap, and ④'s number). ⑥ **State BELCORT's
SST registration status** on the record, so Stripe Tax stays OFF for beta by a fact rather than an
omission (G5). ⑦ **Confirm the `age` identity is in hand and the latest R2 bundle actually decrypts**
— the no-PITR residual only has a recovery path behind it if it does (`DR.md:376-381`), and the
identity is owner-custodied off-repo AND off-R2. ⑧ **State the date of the pre-reset restore** that
discharged G3 (and with it G9's overdue monthly-light row). ⑨ Confirm the `whsec_` signing secret,
the Supabase PAT and the healthchecks ping URL moved **env-to-env, never printed** — the repo is
PUBLIC (裁-135). ⑩ Accept §2's knowingly-open list out loud.

**中文（大白话）.** ① 裁定 **决定 1 — DS-07**（控件高度以哪份文件为准，见 §3）。② 裁定 **决定 2 —
设计仓库那两个回改 PR**：今晚开，还是押后但在 Backlog 里写清楚归谁、下一步。③ **一句话确认**：裁-133 /
裁-111 继续挂着，等下一场开工时再说（裁-150 第 2 条）。④ 确认三件"只是口头报告过"的邮件配置已经**回读
验证**——顺便把**每小时邮件上限那个数字**说出来，目前没有任何文档记着它。⑤ 书面接受那**两个限流数字**
充当 裁-102 缺的那道服务端墙。⑥ 把 **BELCORT 的 SST 注册状态**说出来记上，这样 beta 期间 Stripe Tax 关着
是"有依据"而不是"没人问"。⑦ 确认 **`age` 私钥在手，而且最新那份 R2 备份真的能解开**——没有 PITR 这件事
之所以能接受，前提就是这条恢复路走得通。⑧ 说出**重置前那次"还原验证"的日期**（它同时把 G9 那条过期的
月度还原也补上了）。⑨ 确认 `whsec_` 签名密钥、Supabase 个人令牌、healthchecks 那个 URL 都是**环境到环境
搬的、从没被打印过**——**仓库现在是公开的**（裁-135）。⑩ 把 §2 那张"明知未关但接受上线"的清单**当面认
下来**。

---

## 5 · The Stripe question is RULED — and four repo texts now disagree with the ruling

**The ruling, in two lines.** **裁-126** keeps Stripe in the **BELCORT sandbox for the whole beta**.
**裁-148** settles what the walk does: **checkout is walked ONCE at the seeded beta price — sandbox,
MYR 0**; the **non-zero-price walk belongs to the REAL-MONEY SWITCH ceremony** (Stripe live mode +
KYB, 裁-125/126); and **no temporary "switch the current plan" OPS act** happens at Wave-G. There is
**no live-mode flip at this sitting.** *(Governing text:
`…/scratchpad/truing/ruling-148.md`; **not in the repo yet** — truing-4 lands it.)*

**A TRUING LINE the sitting must file — four texts still say otherwise.** Each was written before
裁-148 and each would send a walker down the wrong path; all four are superseded and should be
re-cut in the PR that minutes this sitting:

| # | Text | What it says | What supersedes it |
|---|---|---|---|
| 1 | `docs/ops/wave-g-setup-checklist.md:190-195` | "The Wave-G walk exercises checkout in Stripe TEST mode **at a non-zero test price** … A zero-amount or skipped checkout does not satisfy this line." | **裁-148 point 1** re-cuts this line to "walk checkout ONCE at the seeded beta price (sandbox, MYR 0); the non-zero-price walk belongs to the REAL-MONEY SWITCH ceremony" |
| 2 | `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:485` | the walk runs "with Stripe TEST mode (**a non-zero test price** + test cards…)" | 裁-148 point 1 |
| 3 | `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:487` | "→ **switch Stripe to LIVE + the RM0 price at the launch sitting** → beta." | **裁-126 + 裁-148**: sandbox for the whole beta; the live flip is the real-money switch ceremony, not this sitting |
| 4 | `docs/plan/active/checkout-gate-gate-record.md:372` | "**Wave G still walks a non-zero test price with test cards** (裁-58's recorded mitigation)" | 裁-148 point 1 — and 裁-58's mitigation is re-homed to the real-money switch, not deleted |

**One clarification rides with them, and it is not an error.** 裁-126's own text
(`docs/plan/active/mohe-grill-rulings-2026-09-02.md:210`) says "the **launch sitting** re-creates the
objects in BELCORT live mode with the ruled price". The **price** is ruled at the pricing sitting
(裁-58 defers the amounts), so "launch sitting" there means the **official launch / real-money
switch**, not tonight's beta go/no-go. The truing should disambiguate the phrase rather than change
the ruling.

**Why this matters mechanically even though it is ruled:** **`livemode` is stored and never read**
(§2 item 1). A live flip is never a one-switch act — it needs the `CLARA_STRIPE_LIVEMODE` env change
**and** a re-run of the round trip against the live account. Leaving four texts saying "flip it
tonight" is how that gets done in the wrong order.

---

## 6 · The first hour after launch — the lead's watch list

*Read all four, in this order, at ~T+5 min, T+20 min and T+60 min. Nothing here is automated: the
external `/ready` uptime check is not wired (§1 G9), so for this hour **the lead is the alarm**.*

> **The 裁-136 `report_artifacts` count is NOT here.** It moved to **G3 step 8**, as an FS-11
> **pre-walk** read — the first seal lands inside the walk, so by the first hour the fact is long
> gone. G6 reads it back from the as-run.

### 6.1 · `/ready` — the runtime

- **Read:** `GET /ready` on the runtime → `ready:true`, `checks.db.ok` true, and note
  `checks.db.latency_ms`. Beside it, `fly status -a clara-runtime` → the intended VERSION, state
  `started`, **checks 2/2**.
- **Baseline, so a standing state is not read as a new fault:** at the v71 deploy `/ready` carried
  **two warnings alongside `ready:true`** — `held_outbox` **119** and the wake-engine lag — both
  **pre-existing, not new from the deploy** (`docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md`
  §4). Fifteen consumer checks report; eight are narrated there by name.
- **Thresholds to act on** (`docs/ops/DR.md:303-308`): DB reachability — any `checks.db.ok` false for
  >1 min; availability — 2 consecutive `/ready` failures; read latency — p95 > 1 s for 5 min.
- **A 503 right after a hard restart is usually NOT a DB fault.** Stale `idle`
  `clara_runtime_login` pooler sessions starve the new VM and never self-heal
  (`idle_in_transaction_session_timeout` does not reap an `idle` session). Runbook:
  `docs/ops/runtime-hard-restart.md` — LOOK, terminate exactly that set, confirm positively.
- **A process restart in this hour is the DESIGNED behaviour, not a defect** (裁-149): an idle-client
  error today becomes an `uncaughtException`, Fly restarts the machine, durable runs resume. The
  listener that softens it for the general pool is scheduled AFTER beta live.

### 6.2 · Stripe problem events — the manual select (裁-147)

- **Read, as the BELCORT operator owner, through the CA-pinned TLS bridge** (`docs/ops/dsn-bridge.md`
  — **never `sslmode=no-verify`**):
  - `select * from clara.list_stripe_event_problems();` — the unresolved queue. **裁-147's standing
    line: this must be EMPTY of unhandled rows**; a non-empty result is resolved through
    `clara.resolve_stripe_event_problem(uuid,text,text)` **with its reason**.
  - `select * from clara.list_stripe_event_problems(true);` — including resolved, to see what was
    handled.
  - `select * from clara.list_unconsumed_registration_payments();` — the **stranded paid applicant**
    read (A-M4, `0163`). A row here is somebody who paid and cannot get in.
- **Why a select and not a screen:** these are DB doors with **no operator screen yet** —
  `docs/product/PRD.md:134-136`, and 裁-147 puts the screen **after beta live**. Measured: the only
  non-doc references to `list_stripe_event_problems` are
  `packages/db/tests/checkout-gate-c2.test.mjs` and `packages/db/tests/rig-meta.mjs`; zero
  `apps/`-side call sites.
- **THE TRAP, and it is DF-2 exactly:** a **DOOR refusal on the webhook path stores nothing today** —
  `stripe_event_problems.event_id` references `stripe_events`, so a refused event leaves no row
  (§2 item 9). **An empty queue is therefore not evidence that no event was refused.** Read the Fly
  logs (§6.4) beside it, always.

### 6.3 · Resend logs

- **Read:** the Resend dashboard / Logs API for `mail.clarabook.com` — deliveries, bounces,
  complaints. Both arms surface here: **signup confirmation + password reset** go through Supabase
  Auth over **custom SMTP pointed at Resend**, and **invitations** go through the Resend API from
  the server-only invite route (`AGENTS.md` menu row; `docs/ARCHITECTURE.md` §1a; 裁-146).
- **Three standing controls to confirm are still in force while you are in there** — the same three
  boxes G1 gates on: **Message storage OFF**, **team log access restricted**, and the **key scoped
  `sending_access` only, domain-restricted** (`docs/ops/wave-g-setup-checklist.md:19-23`).
- **The cap that will actually bite first is Supabase's, not Resend's:** saving custom SMTP applies
  an initial **30 messages/hour** to auth mail, raised on Authentication → Rate Limits. The raised
  value is **not recorded anywhere** — get it stated at the sitting (§4, owner act ④) so the first
  hour has a number to compare against.

### 6.4 · Fly logs

- **Read:** `fly logs -a clara-runtime`, watching for:
  - the **Stripe webhook route** — 400s (a refused event, the one that stores nothing) and 503s
    (fail-closed with a DSN or secret absent);
  - the **auth-wall confirm route** — 503 means the wall cannot reach its DB or the service token
    mismatched; **401 on every confirmation** means `CLARA_AUTH_WALL_SERVICE_TOKEN` differs between
    `apps/web` and the runtime;
  - a **503 for every applicant** with nothing looking wrong in either config ⇒ the runtime's
    `CLARA_TRUSTED_CLIENT_IP_HEADER` is not `X-Clara-Client-IP` (§1 G2).
- **Both routes answering 503 on an empty POST is the documented fail-closed posture** when the
  checkout-gate DSNs are absent — it was the positive read at the v71 deploy, and after FS-11 it
  should no longer be what you see.
- **Also read `fly logs -a clara-backup`** once in the hour — the daily pipeline's success line is
  the other half of G9's healthchecks read.

---

## 7 · The CLOSE protocol — 裁-150

> **裁-150 (owner, 2026-09-03 ≈18:02 MYT) governs this section.** Its four points: ① after the
> beta-live e2e **THIS session closes**, and **the repo is the handover** — every open item lives in
> `PROGRESS.md` as a Backlog or Known-issues row **with its owner, its next step and its ruling
> number**, the memory cache holding lessons and preferences only (constraint 8); ② **NO next lanes
> are dispatched** — the next session starts on the owner's ask, not an agent's initiative; ③ the
> pre-上市 roadmap stays in the Backlog as the ordered list the owner picks from; ④ **two truings
> remain: truing-4 (now) and the FINAL clock-out truing after this sitting.**
> **裁-150 is NOT in the repo** (`grep` returns zero hits across `docs/`, `PROGRESS.md`,
> `AGENTS.md`) — the governing text is `…/scratchpad/truing/ruling-150.md`, and **landing it is
> itself part of the final truing.**

### 7.1 · The FINAL clock-out truing — its contents, as a checklist

- [ ] **`PROGRESS.md` posture** flipped to **BETA LIVE** (or **NO-GO** with the measured reason).
      Obey the **STATE-LINE rule**: one state, ONE copy — a Lanes or Next row states the STEP and the
      RULING and then points at the banner; a sha, a verdict and an armed/disarmed fact live in the
      **banner only** (orders §C, the 09-03 ~05:30 clause). A row that restates a moving fact is the
      second copy, and the second copy is always the stale one.
- [ ] **Every Known-issues and Backlog row carries three things** — 裁-150 point 1's literal
      requirement, and the shape the whole handover rests on:
      **owner · next step · ruling number.** Walk §2's twenty rows and give each one all three. The
      four that have none today: DS-07 (until DECISION 1 rules it), the two recut PRs (until
      DECISION 2 rules them), 裁-147's operator screen, and 裁-149's pool-error PR.
- [ ] **The launch facts, written once, in the banner:** the go/no-go verdict and its date · the
      launch tip's sha · the FS-10 and FS-11 as-run paths · the Mail gate's certification (Act 1) ·
      the first sealed artifact's manifest line and the pre-walk `report_artifacts` count (G6) ·
      the pre-reset restore's date (G3/G9) · the Stripe posture in one clause (**sandbox, MYR 0,
      whole beta — 裁-126/148**).
- [ ] **The pre-上市 roadmap as an ORDERED Backlog list** (裁-148 point 3 / 裁-150 point 3): the
      pricing sitting (裁-58) → the billing tier tranche (裁-144) → the lawyer pass on the legal
      texts (裁-125) → the real-money switch + KYB + the non-zero checkout walk (裁-125/126/148).
      Beside it, the post-beta product PRs already ruled: **裁-147** the operator screen, **裁-149**
      the pool error contract.
- [ ] **Harness-sync sweep** over every menu file — anything stale gets trued, or flagged under
      Known issues if truing it needs a decision:
      `AGENTS.md` (the 裁-133 / 裁-111 clauses re-stated as *suspended, decided next session*; the
      CI/CD paragraph's sweep count and last verdict; the **ledger pointer to the newest ruling
      file**) · `docs/adr/README.md` **(the SPLIT first — it is at exactly 500/500 and no new row can
      land until it is split)** + a dated line in `docs/adr/README-log.md` for every ruling
      (裁-140: a digest row plus an "amended by" line, never a new ADR, each stating its TIME BOX) ·
      `docs/product/PRD.md` · `docs/ARCHITECTURE.md` §1a (and 裁-149's pool-error contract when that
      PR lands) · `docs/product/EVALUATION_RUBRIC.md` · `docs/ops/DR.md` (the new drill dates from
      G3/G9) · `docs/ops/wave-g-setup-checklist.md` (**every box ticked with its named proof or
      moved to a row**, including 裁-148's re-cut of the checkout line and 裁-147's new manual line) ·
      `docs/plan/index.md` (the new as-runs filed under `docs/plan/completed/` per the index's own
      path-stability convention) · `packages/db/README.md` (the applied frontier: **159 /
      `0164_checkout_gate_c6_web_reads`**) · `packages/runtime/README.md` · `apps/web/README.md`.
- [ ] **The four superseded Stripe texts trued** — §5's table, in this same PR.
- [ ] **The as-runs** — FS-10's cutover as-run and FS-11's Wave-G as-run in `docs/plan/completed/`,
      with **every proof artifact from the checklist and the walk retained** (裁-122), every corpus
      gap marked **资料缺失** (裁-63), and the RPR bank-statement series pick recorded **with why**
      (checklist `:224-226`).
- [ ] **The ledger entry for this sitting** — continuing the chain (`-08-31` → `-09-01` →
      `-09-01-pm` → `-09-02` → `-09-02-pm` → `-09-03` → next), each file continuing at the previous
      one's 500-line ceiling. **裁-147 through 裁-150 must land here if truing-4 has not already
      landed them** — until then they exist only in the session scratchpad.
- [ ] **Grill the owner** on any ambiguity or foreign change found and not resolved (`AGENTS.md`
      clock out, step 3).
- [ ] **The paperwork is PUBLIC** (裁-135). No secret, DSN, `whsec_`, healthchecks ping URL or PAT
      value in any of the above — hashes and redactions only (the checklist's own proof rule: compare
      a **hash** of the pepper and the service token across environments, never the values).
- [ ] **Memory refresh — lessons and preferences ONLY, never state** (constraint 8). Candidates:
      the dispatch-model-law file (裁-133's "suspended until beta live" amendment now needs the
      裁-150 nuance: *decided at the next session's start*) · the operating-model file · new lessons
      from FS-10, FS-11 and this sitting, in the Why / How-to-apply shape.
- [ ] **Re-index the codebase graph** (`codebase-memory-mcp` · `index_repository`) if code changed
      materially across FS-10/FS-11 (`AGENTS.md` clock out, step 5).

### 7.2 · Teardown — the list, by name

**Worktrees.** The census of record is
`…/scratchpad/housekeeping-worktrees.md` (taken 17:07 MYT 09-03: **30 worktrees incl. main**).
`git worktree list` reads **31** at `5eab358d` — **one has appeared since, so re-census by a walk
before removing anything.**

- **Method (memory law: `git worktree remove` FOLLOWS junctions):** for each directory, **enumerate
  the reparse points by a walk, never from memory**, unlink them deepest-first, verify zero, THEN
  `git worktree remove`, then `git worktree prune`. Post-flight is a `node_modules` **probe by
  content**; the repair is a link-aware remove plus `pnpm install --frozen-lockfile`.
- **KEEP until its PR merges or its review closes** (from the census; re-check each against `gh`
  first, because several have merged since it was taken): `agent-ac3073c88537882aa` (docs-146,
  #537) · `agent-a252542b443fbfd97` (docs-143, #535) · `agent-ab579b08fb056a840`
  (file-billing-spec, #536) · `agent-a82a67132ec0f37ce` (fold-531, #531) ·
  `agent-ad8560b817752191a` (the original #531 lane — remove together with the one above) ·
  `agent-ad2381bb75a356536` (web-agents-laws, #527) · `agent-a23954018995ab672` (rev-docs-0903).
  **Plus whatever truing-4 is holding — it is live right now.**
- **REMOVABLE at the pause window** (PR merged / review closed): `agent-a03968a61c707eb2c` ·
  `agent-a130cf03446058220` · `agent-a3dcc1396dada32f2` · `agent-a5e6e27d76f00c764` ·
  `agent-a73f674a88af793f5` · `agent-a927288fbed86db8c` · `agent-aaeedd75eb40aa9e8` (15 per-entry
  junctions) · `agent-ab0feaaf81ae6afa3` · `agent-abd3cfca4c13ee0f2` · `agent-adbb65c0ea8daa17b`
  (**identify by `git log -1` before removing**) · `agent-ae55ee90346dec6ac` · `c5-webhook` ·
  `chat-parity` · `fix-498` · `p4-6-nav` · `p6-5` · `p6-6` · `parity-holes` · `mech-truing-0902`
  (kept only for their reparse points — unlink by walk, then remove) · **`lane-b` (#517, merged
  `aa789d65`; junctions already unlinked → plain remove)** · `rev-532` (no junctions → plain remove).
- **The LOCKED shells — three lists disagree and the teardown must settle it by a walk, not by any
  of them.** The 17:07 census names **two** (`agent-a01d56452325f30d7`,
  `agent-a7564317af1eccf1c` — "prior sessions; leave"); `PROGRESS.md:389` names **three**
  (`agent-a9f6854ecb5fbc759`, `agent-ac1c38bc266b18dc1`, `agent-aae5e2c5571e21b91`);
  `PROGRESS.md:481` names a fourth (`agent-a13c9c7d877268370`). **Four distinct ids across three
  lists.** None holds anything. Removal needs an **elevated shell after a Claude Code restart**,
  then `git worktree prune` — and the restart also kills the stale 31-Aug session. **File the
  reconciled list as a truing line.**
- **Also:** `packages/runtime/node_modules/.cache` + `.nitro` in main's store (WDK output through a
  plain junction) — remove.

**Rigs.** Drop every throwaway rig and its container. **Census `docker ps -a` and act BY EXACT
NAME** — the housekeeping note records that **none of the lead's rigs are standing**, and that
**`preview-postgrest` and `preview-rig` are NOT ours to touch.** **One teardown registrant per
resource**, and a FORCE drop only **after an awaited close** (a session cannot drop the database it
is connected to; `PGDATABASE=postgres` explicit). Then **census the cluster for leftovers**: stopping
a runner does **not** reap a cancelled job's service containers — five orphaned
`<jobid>_postgres17_<hash>` containers were found 2h17m after the WSL services stopped
(`AGENTS.md` CI/CD; `docs/ops/ci-runner.md` "Re-register / decommission").

**The conductor.** Stop the **detached serial conductor explicitly** — it is designed to outlive a
session cut and did, merging four PRs unattended on 09-03. Before killing it: confirm **no armed PR
is left in its queue** (it never arms; arming is the lead's own act after a CLEAR verdict). Kill it
**by its spawn-handle PID**, never by a CommandLine name match — a name-kill on
`--test-concurrency` once matched every lane's db suite.

**Monitors and watchers.** Kill the file-watchers and the **run-id-pinned DONE watchers**
(`docs/ops/ceremony-practices.md` §3). Release the **WSL keeper last**, after the final rig is down —
WSL idle-terminates without a Windows-side holder and takes every container with it.

**The parked CI fleet.** The four WSL runner services were stopped and disabled 2026-09-02; complete
the `config.sh remove` un-registration and re-run the container census (`docs/ops/ci-runner.md`).
**They must never be re-pointed at `pull_request` while the repo is public.**

**Owner housekeeping at the pause window.** Delete the two untracked PNGs in the repo root
(`fs2-01-login.png`, `fs2-02-login-focus-email.png` — or move them to the scratchpad); the vhdx
compaction and a Claude Code restart **together**.

### 7.3 · The last message to the owner

*One message, sent after the truing merges and the teardown is done. It is the handover, so it says
where things are and nothing else — no next steps, because 裁-150 point 2 rules there are none.*

1. **The verdict and the tip** — BETA LIVE (or NO-GO with the measured reason), the sha, the time.
2. **What is live** — the origin, the Stripe posture in one clause (**sandbox, MYR 0, whole beta**),
   the Mail gate's certification, the operator flag, the first sealed artifact.
3. **The two rulings taken tonight** — DECISION 1 and DECISION 2, each with where it is recorded
