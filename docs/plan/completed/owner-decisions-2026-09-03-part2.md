*Part 2 of 2 of the 23 owner ceremony decisions pack (2026-09-03), the input to 裁-151…173 — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `owner-decisions-2026-09-03-part1.md` · Next: none (this is the last part).*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*


---

#### OD-16 · The beta terms of service — in force at beta, or a recorded deferral? *(launch-sitting G8 / R3, 裁-129 × 裁-145)*

**Question (en).** 裁-145 counts the Beta terms among the signup-gate items, but
`clara.dpa_documents` has **no `kind` column** on this tip, the app deliberately presents **one**
document and says so in its own source
(`apps/web/components/entry/signup-dpa-form.tsx:53-63`), and the terms text itself records
**"NOT SEEDED. NOT IN FORCE."** (`docs/ops/legal/clara-beta-terms.md:840`) — does beta launch with
the DPA signature only and the terms as a stated deferral, or does a DB PR add the `kind`
discriminator and seed the terms before the walk?

**问题（大白话）.** 注册那一步到底要签几份文件？现在数据库里只有 DPA 一份、也只能存一份（没有「文件种类」这
一列），前端很诚实地写着「beta 服务条款还没上，这个签名不包含它」。但裁-145 的说法里条款是第五样。所以要定：
**beta 就先只签 DPA、条款写成明确的延后**，还是**先合一个数据库 PR 把条款也存进去、注册时一起签**？

**Recommendation: launch with the DPA signature only, and record the terms as a dated Backlog row**
(the `kind` discriminator + per-kind partial unique index + `sign_dpa`'s carrier gaining `kind`, all
riding the next DB PR touching the store, with 裁-90's byte-identity law extended to the terms). The
app is already honest about it — the alternative is a second checkbox recording nothing, which is the
fake receipt this product forbids. Then re-cut 裁-145's phrasing so "five items, four live" names the
terms as the not-yet-live fifth.
**Cost.** The recommended path costs one Backlog row and one docs truing. The alternative costs a DB
migration PR + a web PR + a full ladder + a hand sweep, on the critical path to beta.
**If unruled:** the repo contradicts itself at the one gate a real applicant passes through
(R3), and the sitting discovers it while a live applicant is mid-signup.

---

### C · AT THE LAUNCH SITTING

---

#### OD-17 · DS-07 — which artifact is authoritative for control heights *(launch sitting DECISION 1)*

**Question (en).** For button and input heights, which document is authoritative — the design repo's
token contract §5.2 (`--control-sm/md/lg` = **32/36/40 px**), or the shipped reference in
`apps/web/components/ui/button.tsx` (**24/28/32/36 px**), whose size-variant block is byte-identical
to the design authority's own component?

**问题（大白话）.** 按钮和输入框的高度以哪一份为准——设计仓库那份「代币合同」写的 32/36/40，还是现在真的在
跑、而且和设计仓库自己的组件一个字都不差的 24/28/32/36？

**Recommendation: option B — the shipped reference is authoritative, and §5.2 is recorded as never
implemented.** §5.2 was never implemented in either repo; the shipped block is byte-identical to the
authority's own (md5 `6f29955ea9f9f080f7e602149d6a4aa6`), so choosing A **desynchronises `apps/web`
from the port it came from**; and 裁-13's 24 px target-size gate is GREEN on the shipped heights, so
nothing is unlawful today. Record it 裁-137-shape (contract vs reference): a digest row plus a dated
`README-log.md` line, **never a new ADR** (裁-140).
**Cost.** B leaves the 13 `size="xs"` buttons exactly on the SC 2.5.8 floor with zero headroom —
lawful, nothing to spare — and leaves §5.2 unimplemented in both repos, which must then be written
down as such. A costs a re-map of the size-variant block **plus a third owner PR** in
`clarabook-frontend` beside OD-18's two.
**If unruled:** FS-9's sign-off keeps an owner-owed line open and `PROGRESS.md`'s DS-07 row goes into
the handover with no owner and no next step — the one shape 裁-150 point 1 forbids. Not beta-gating.

---

#### OD-18 · The two `clarabook-frontend` recut PRs — open now, or defer with a row *(launch sitting DECISION 2)*

**Question (en).** Do the two recut PRs to the design-authority repo — 裁-64②'s `--input` token value
and R3 §9's focus-ring founder amendment — get opened now, or deferred with a dated Backlog row
naming their owner?

**问题（大白话）.** 设计权威仓库还欠两个回改 PR。**今晚开，还是押后**——但要在 Backlog 里写清楚归谁、下一步是
什么？

**Recommendation: DEFER, with a dated `PROGRESS.md` Backlog row naming the owner as the actor and
裁-64② / R3 §9 as the rulings.** They are the owner's PRs by ruling, they sit outside every lane's
write boundary, they change no shipped behaviour here (the `--input` value is already set lawfully by
#515 at `apps/web/app/globals.css:304`), and 裁-150 point 2 means "open now" is the owner's own hands
at the end of a launch night.
**Cost.** Deferring lets the ClaraBook design law keep drifting from the shipped app, and any future
port re-imports the drift. Opening tonight costs two small PRs in a second repo at the worst hour.
**If unruled:** the drift has no lawful home — ADR-0075 §6 makes a `PROGRESS.md` row the only place a
deferral may live.

---

#### OD-19 · Accept the two rate-limit numbers in writing as 裁-102's wall — and state the missing one *(launch sitting owner acts ④⑤; security-pass item 6 as re-cut by 裁-146)*

**Question (en).** 裁-102 is still open — `/signup`'s `supabase.auth.signUp` send path has no
server-side wall of ours — and the ruled substitute is "the rate limits, accepted in writing, by their
numbers": will the owner accept the **Resend plan's cap** and the **raised Supabase auth rate limit**
as that wall, and **state the raised number**, which no document anywhere records?

**问题（大白话）.** 注册那一步的发信没有我们自己的服务端限流墙，裁-146 的说法是「拿两个限流数字当墙，但必须
白纸黑字写下数字」。第一个数字是 Resend 套餐的上限；第二个是 09-03 那天你在 Supabase 后台调高的那个值——
**当时没有说是多少，任何文档里都没有**。请把它说出来记上，并书面接受这两个数字充当那道墙。

**Recommendation: accept, with both numbers written into the as-run and the checklist** — and read
both back by Management API at the walk, not from a screenshot. The default mailer's 2/hour is
**not** the number that applies once custom SMTP is on.
**Cost.** Two lines in the as-run. Refusing to accept means 裁-102 needs a server-side wall built —
a code PR nobody has ordered, on the critical path.
**If unruled:** security-pass line 6 is ticked against a number that does not exist, which is the
false-measurement class.

---

#### OD-20 · BELCORT's SST registration status, stated on the record *(launch sitting owner act ⑥; checklist `:181-183`)*

**Question (en).** The checklist's rule is *"Stripe Tax is switched on only once BELCORT's own SST
registration status says so — no tax line before registration"*: at MYR 0 there is no tax line to
compute, so the expected posture is **Stripe Tax OFF for beta** — will the owner state BELCORT's SST
registration status so that posture rests on a fact rather than an omission?

**问题（大白话）.** 清单规定「只有当 BELCORT 自己有 SST 注册身份时才打开 Stripe Tax」。beta 全程 MYR 0，本来
就没有税额要算，所以 beta 期间 Stripe Tax 是**关着**的。请把 BELCORT 的 SST 注册状态**说出来记上**——这样
「关着」是有依据的，而不是没人问过。

**Recommendation: state it, and record Stripe Tax OFF for beta as a consequence of the stated fact.**
The real-money switch ceremony then inherits a fact instead of a question.
**Cost.** One sentence.
**If unruled:** a tax posture with no stated basis carries into the real-money switch, where it stops
being free.

---

#### OD-21 · Accept the knowingly-open list out loud, and acknowledge the two suspended time boxes *(launch sitting owner acts ③⑩; §2's twenty rows)*

**Question (en).** Will the owner accept, out loud and on the record, the twenty knowingly-open items
the sitting carries into beta (`launch-sitting-prep.md` §2 — every one already a `PROGRESS.md` Backlog
or Known-issues row), and acknowledge in one line that 裁-133 (no Codex lane) and 裁-111 (the
cross-family review leg) **stay suspended, not repealed**, to be decided at the next session's start?

**问题（大白话）.** 有二十件事是「明知没关、但接受它带着上线」的，全都已经在 PROGRESS 里挂着行。请当面**认下
这张清单**；另外用一句话确认：裁-133、裁-111 那两条继续挂着，不是撤销，下一场开工时你说了算。

**Recommendation: accept, item by item, with the two beta-shape ones read aloud** — `livemode` is
stored and never read (裁-120 A-M5), and a paid applicant who joined another firm strands their
payment (A-M4, reachable only through the audited SQL door). Both are honest gaps, not surprises.
**Cost.** Ten minutes at the sitting.
**If unruled:** the launch's residuals are "discovered" rather than accepted, and 裁-150's handover
inherits rows nobody signed for.

---

### D · AT THE CLOSE

---

#### OD-22 · The DR drill's STRICT `4.9` parity probe loses its subject *(follows OD-11; `docs/ops/DR-full-drill.md:198`)*

**Question (en).** Once the canary's clara-side rows are dropped, the STRICT DR drill's `4.9`
cross-schema parity probe has no subject — do we name a replacement subject (a post-reset durable
run), or record `4.9` as N/A with a Known-issues row carrying the consequence?

**问题（大白话）.** canary 的 clara 行被删掉之后，灾备演练里那一项「跨 schema 一致性」检查就没有对象了。是
**指定一个新的对象**（重置后新产生的一条持久化运行），还是**记成「不适用」**并在 Known issues 里写清楚后果？

**Recommendation: name a replacement subject from the post-reset estate at the FINAL truing** — the
walk itself produces durable runs, so a subject exists by then — and if none qualifies, record `4.9`
as **UNPROVEN IN THE FIELD** with which it was, never a silent skip.
**Cost.** One Known-issues row either way; naming a subject costs one read.
**If unruled:** a STRICT drill quietly degrades to a weaker one and nobody notices until the next
recovery.

---

#### OD-23 · The close housekeeping — the two untracked repo-root PNGs, the locked worktree shells, the vhdx *(launch-sitting §2 item 20, §7.2)*

**Question (en).** At teardown, do the two untracked PNGs in the repo root
(`fs2-01-login.png`, `fs2-02-login-focus-email.png`, both untracked at `git status`) get committed as
walk evidence or deleted, and does the owner run the elevated-shell removal of the locked worktree
shells plus the vhdx compaction at the pause window?

**问题（大白话）.** 收尾时：仓库根目录那两张没入库的截图，是当作走查证据提交，还是删掉？另外那几个锁住的
worktree 外壳要用管理员窗口清掉、vhdx 要压缩——这两件都得你亲自动手。

**Recommendation: delete the two PNGs** (they are FS-2-era login screenshots, superseded by the walk's
own receipts; the repo is PUBLIC — 裁-135 — and stray untracked images are the kind of thing that
gets committed by accident), and run the teardown census by a **walk**, never from any of the three
disagreeing estate lists.
**Cost.** Minutes. Keeping them costs a public repo two orphan images with no provenance line.
**If unruled:** the handover tree carries untracked artifacts and the worktree census stays
contradicted by three lists — exactly what §7.2 exists to settle.

---

## 2 · ALREADY RULED — dropped from the list above, cite the ruling instead

| Was a decision in | Now settled by | What it says |
|---|---|---|
| FS-10 §0 (Stripe key mode) · FS-11 pass-1 D (price) · launch sitting "DECISION B" | **裁-126 + 裁-148** (`docs/plan/active/mohe-grill-rulings-2026-09-02.md:207-217`; `…-09-03.md`; `…/scratchpad/truing/ruling-148.md`) | Stripe stays in the **BELCORT sandbox for the whole beta**; the walk exercises checkout **ONCE at the seeded beta price — sandbox, MYR 0**; the **non-zero-price walk belongs to the REAL-MONEY SWITCH ceremony** (live mode + KYB, 裁-125/126); **no temporary "make a priced plan current" OPS act at Wave-G**. Any repo text saying "switch Stripe to LIVE at the launch sitting" is **SUPERSEDED** — §5 files the three that remain |
| The Mail question (who sends, at what cap) | **裁-146** (`docs/plan/active/mohe-grill-rulings-2026-09-03.md`; digest law 87; checklist `:24-71,79-84`) | Custom SMTP → Resend configured ≈16:08 MYT 09-03; delivery to a **non-team address PROVEN ≈16:55** via the *Invite user* arm; **the `/signup` six-digit-code certification is still OWED at the walk** — a launch gate, not a wording item |
| Whether the C-2 operator problem-event screen blocks beta | **裁-147** (`…/truing/ruling-147.md`; checklist line, on main via #538) | The screen is **post-beta** (a Backlog row); **now** one manual line — at the walk **and** at cutover the Stripe problem list must be EMPTY of unhandled rows, resolved through `clara.resolve_stripe_event_problem` with its reason |
| The runtime pool `'error'` contract | **裁-149** (`…/truing/ruling-149.md`) | Option C, **after beta live**, as a product PR: the general pool logs/counts/raises a health flag, the **leader's `makeClient()` stays CRASH-LOUD**. **Nothing to do in these three ceremonies** |
| What happens after the e2e | **裁-150** (`…/truing/ruling-150.md`) | The session **CLOSES**; the repo is the handover; **NO next lanes**; every unresolved item becomes a Backlog or Known-issues row with its owner, next step and ruling number |
| The billing tier tranche | **裁-144** | Backlog, completed before 上市 — **not** before beta live |
| The operator tier's shape and hard cap | **裁-143** | A separate tier beside the four permission levels; the operator sees registration applications + Stripe problem events **only** |
| The fifth signup-gate item's existence | **裁-145** | PRD §9.3 gains a dated note: five items after 裁-129; the "email-bound token" is RETIRED by 裁-89 — *but whether the terms are IN FORCE at beta is still open: **OD-16*** |
| The wrong-secret illustration | **裁-142** | `apps/web`'s FS-4 credential is `STRIPE_SECRET_KEY`; `STRIPE_WEBHOOK_SECRET` is **runtime** env |

---

## 3 · LAUNCH BLOCKERS — what must be true or built before beta live

*Ordered by what stops an applicant first. "Code PR" means it cannot be done from a console.*

| # | Blocker | Smallest fix | Code PR? |
|---|---|---|---|
| 1 | **Chat and SSE are dead from the deployed origin.** `apps/web/lib/clara/api.ts:56-58` + `lib/clara/stream.ts:240-242` resolve a build-time `NEXT_PUBLIC_CLARA_RUNTIME_URL`; `next.config.ts:47-55` declares "DELIBERATELY no `rewrites()`", so nothing catches it | Repoint `api.ts`, `stream.ts`, `useClaraThread.ts` at `/api/runtime/*` + the five suites and the e2e mock (`apps/web/e2e/chat-parity-mock.mjs:209-211`); prove streaming survives OpenNext at FS-10 S14 (fallback = a runtime CORS allowlist) | **YES** |
| 2 | **The pepper and the auth-wall service token must be the SAME BYTES on `clara-web` and `clara-runtime`**, and the hash proof has no two operands until FS-11 step 12 | OD-3's minting rule: mint once at FS-10 S8, carry the same bytes to FS-11 step 12, run the hash compare there | no |
| 3 | **`CLARA_TRUSTED_CLIENT_IP_HEADER` is the same NAME with two different correct VALUES** — `CF-Connecting-IP` on `apps/web`, `X-Clara-Client-IP` on the runtime (`docs/ops/wave-g-setup-checklist.md:114-124`); any other runtime value ⇒ 503 on every applicant's confirm with nothing looking wrong | Set both per the checklist and read both back in the same sitting | no |
| 4 | **`packages/db/deploy/acl-baseline.sql` has never run on the live project**, and no dump carries it (`docs/ops/DR.md:256-259`) — the confined checkout-gate roles keep `public` USAGE | FS-11 **step 6** (exists in the folded record), after step 5 and never before: `ACL baseline verify: OK` + the eleven-role roster `usage_public = f` + `clara_auth_wall` holding no `public` USAGE | no |
| 5 | **`clara_auth_wall_login` and `clara_stripe_webhook_login` ship NOLOGIN** and their migration tails refuse `rolcanlogin` by design (`0163_checkout_gate_c3_folded_door.sql:165-185`; `0160:120-131`) — the confirmation wall 401s until they are flipped and their DSNs set | FS-11 step 11: the two flips in a private session via the `read-logins-ceremony.sql:24-44` idiom (superuser-guarded), then the two DSNs env-to-env | no |
| 6 | **`clara.stripe_object_map` is empty after the reset** — without the product/price rows a beta signup dies at `CLR10 no stripe price is mapped for this plan` | FS-11 step 10's OPS act (`set role clara_fn_owner` — forced RLS, one write policy), proven by one `open_checkout_intent` that does not raise CLR10 | no |
| 7 | **A full re-migration ships all nine evaluators DARK** (`evaluator_versions` rows insert `deployed = false` by construction) — every figure needing a deployed evaluator refuses, and the walk's report render fails | FS-11 step 8: nine `deploy-evaluator-version.mjs` runs under the bare principal; **never** `--lock-deployed`. **This obligation is in no checklist** — it must be added | no |
| 8 | **BELCORT does not exist after the reset**, and `is_operator` refuses on zero BELCORT rows (`docs/ops/g1-operator-firm-ceremony.md:93-109`) | OD-10 route (a): mint BELCORT through the self-serve door at FS-11 step 13, then `is_operator` at step 14 | no |
| 9 | **The Mail gate is NOT certified** — the ≈16:55 proof was the *Invite user* arm (a LINK), not the `/signup` six-digit code | FS-11 step 17: one real `/signup` confirmation to a non-team address, arriving in ~1 min and verifying on the confirm page (裁-146 point 3) | no |
| 10 | **Supabase Auth → "Allow new users to sign up" must be ON** (`docs/ops/wave-g-setup-checklist.md:149`) — with it OFF every gate below passes and no applicant can start | Read it back by Management API at the walk | no |
| 11 | **HTTPS on the deployed origin** — `__Host-clara-auth` and `__Host-clara-confirm-flash` are dropped silently over plain HTTP with no error at any layer | Confirm the cookie actually lands after a login on the real origin (DevTools → Application → Cookies) | no |
| 12 | **The restore-proof before the reset** — the only thing standing between `DROP SCHEMA clara CASCADE` and an unrecoverable estate; the monthly-light cadence is **~43 days overdue** (last 2026-07-22) | OD-14: restore a bundle into a throwaway PG17 + the `dr-verify` subset, **plus** `DR-full-drill.md:128-146`'s post-restore ceremonies (a restore that skips them is not a proven restore) | no |
| 13 | **No instrument in the repo walks a REMOTE deployed origin** — `apps/web/e2e/run.mjs:14-28` serves a LOCAL build and mocks Supabase; every spec is written against that harness | Write a ceremony-time Playwright script driven from the scratchpad against the preview and the real origin; the as-run names which instrument was used (裁-86 requires the real-browser leg) | no |
| 14 | **Two launch-blocking checklist lines cite the wrong migration** — `security-pass-2026-09-02.md` items 4 and 5 cite `0161` (which is Q-D6); the auth-wall role is minted by `0163` | One docs-only truing PR (single-lane review, ADR-0069) re-citing `0163` | docs-only PR |
| 15 | **The beta terms are not storable and not presented** — `clara.dpa_documents` has no `kind` column; `clara-beta-terms.md:840` says NOT SEEDED, NOT IN FORCE | OD-16: launch on the DPA signature only with a dated Backlog row, **or** a DB+web PR adding `kind` and seeding the terms | only if the owner rules the terms IN — then **YES** |
| 16 | **The `age` identity must be in hand and the latest R2 bundle proven to decrypt** — there is no PITR, so this is the only recovery path behind the accepted residual (`docs/ops/DR.md:376-381`) | Owner confirms at P7 / owner act ⑦, before FS-11 opens | no |

---

## 4 · THE CROSS-CEREMONY ORDER — FS-10 vs FS-11

**Where the three records agree.** FS-10's soak **closes and is recorded BEFORE FS-11 opens**
(FS-10 D4; FS-11 D-5; launch-sitting P3/P4 both require the as-runs filed in order). The reason is
measured, not stylistic: FS-11 stops the runtime and runs `DROP SCHEMA clara CASCADE` followed by a
fresh apply of `0001`…`0164` — **there is no delta apply** — so every route the soak watches returns
errors for the whole span, and a soak observation taken across a reset measures the reset, not the
Worker. The soak is the precondition of FS-10's one irreversible act.

**Where they disagree — the owner's call (OD-8).** FS-10 D4 adds *"and FS-11 runs inside a declared
maintenance window regardless"*; FS-11 D-5 says no window is needed because no beta user exists yet.
**Recommendation: no maintenance page; a stated window recorded in the as-run** (start/end
timestamps, errors expected and recorded) — the first invited firm signs up after this ceremony, and
a holding page is an unordered, unproven Cloudflare surface added at the worst hour.

**The resulting order, end to end:**

```
OD-1 + OD-2 code PR (chat/SSE + config)  → merged, full ladder, hand sweep green
  → FS-10 A: pin tip · dispatch+read the sweep · re-measure the tree · deploy-record check · four exit gates
  → FS-10 B: disconnect the Pages Git integration      [first mutating act, reversible]
  → FS-10 C/D: build on Linux · versions upload · PREVIEW WALK (routes · origin wall's UNSET arm first ·
               chat/SSE S14 · the 11 security lines · the ?ct= look)
  → FS-10 E: remove the domain from Pages · promote the WALKED version · attach the custom domain ·
             narrow CLARA_PUBLIC_ORIGINS · re-walk on the real origin · PREVIEW CLOSE-OUT
             (alias deleted + the allowlist re-read as exactly two entries, no wildcard)
  → ── SOAK (OD-7: 24 h, three named observations) ─── closes and is RECORDED ───
  → [OD-9: the Pages project delete happens here or becomes a Backlog row;
     the apps/dashboard SOURCE delete is recommended DEFERRED — never on the repoint commit]
  → FS-11 (inside the stated window, OD-8): target string · backup · RESTORE-PROOF (OD-14) ·
           quiesce · RESET · MIGRATE 159 · ACL BASELINE · SEED · nine evaluators · start runtime ·
           stripe_object_map · the two LOGIN flips · the nine secrets + THE HASH COMPARE (OD-3) ·
           the sandbox round trip (mints BELCORT, OD-10) · is_operator ·
           the corpus walk · the product walk · the MAIL CERTIFICATION · OTP 60 min · close
  → THE LAUNCH SITTING (OD-17…OD-21) → beta live
  → THE CLOSE (OD-22, OD-23) + the FINAL clock-out truing → 裁-150: the session ends, no next lanes
```

**One ordering trap, stated because it is not obvious.** After FS-11's reset, rolling FS-10 back to
Pages **restores the OLD app against a NEW database** — `apps/dashboard` is not the app `0164` was
built for. So the Pages rollback has value **only before FS-11 opens**, which is precisely why the
soak closes first and why the irreversible deletes are the last thing in FS-10, not the first thing
in FS-11.

---

## 5 · Truing lines this consolidation owes the repo

- **T-A — three texts still contradict 裁-126/裁-148** after truing-4 (the checklist line WAS re-cut,
  these were not): `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:438`
  (*"a non-zero test price + test cards"*) and **`:440`** (*"switch Stripe to LIVE + the RM0 price at
  the launch sitting"*); `docs/plan/active/checkout-gate-gate-record.md:372` (*"Wave G still walks a
  non-zero test price"*); `docs/plan/active/checkout-gate-design-part3.md:180` (*"TEST-mode restricted
  key **until the launch sitting**"* — under 裁-126 it is sandbox for the **whole beta**). Re-cut all
  four citations to 裁-126/裁-148, and disambiguate 裁-126's own phrase *"the launch sitting
  re-creates the objects in BELCORT live mode"* — that means the **real-money switch**, not tonight's
  go/no-go.
- **T-B — `security-pass-2026-09-02.md` items 4 and 5 cite `0161`**; the auth-wall role pair is minted
  by `0163_checkout_gate_c3_folded_door.sql` (`0161` is Q-D6). Same defect at
  `packages/runtime/lib/checkout-pools.mjs:45`.
- **T-C — the apply span.** `PROGRESS.md`'s banner and
  `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:434` say the FS-11 apply is
  *"`0154`…`0164`"*. That is true of *what is unapplied today* and **false of what the reset tooling
  produces**: `clara.schema_migrations` lives inside the dropped schema, so the migrator re-applies
  **all 159 files, `0001`→`0164`**. Re-cut both, or the ceremony's own summary read (`159 new
  migration(s) applied`) will look like a defect.
- **T-D — `docs/ops/DR.md:397-402`'s owner-run classifier** predates ADR-0075's widening (OD-13). File
  the supersession sentence there, scoped to test data, leaving the crown-jewel items owner-run.
- **T-E — the *Reset password* template box has no home.** `docs/ops/wave-g-setup-checklist.md:52-53`
  and `:155-156` both park it in *"the pending FS-10 notes"*, a document that does not exist. Give it a
  permanent home in the checklist's signup-gate section. *(The template RULE does have a home —
  裁-146 wrote it at `:49-54`.)*
- **T-F — the evaluator re-deploy obligation is in no checklist** (launch blocker 7). Add it to
  `docs/ops/wave-g-setup-checklist.md` beside the reset lines.
- **T-G — the FS-10↔FS-11 maintenance posture exists nowhere in the repo** (OD-8). Whatever the owner
  rules goes into the as-run and the checklist.

---

## 6 · notFound — asked for, not in the repo, never invented

1. **No Cloudflare Pages / Workers / DNS / rollback runbook** under `docs/ops/` — every dashboard
   click in FS-10 comes from Cloudflare's own product docs, not a repo recipe; confirm the click paths
   on screen before executing.
2. **No soak-window duration** anywhere (OD-7's 24 h is a recommendation, not a repo fact).
3. **No instrument that walks a remote deployed origin** (launch blocker 13).
4. **No proof that a Next.js Route Handler's streamed body survives OpenNext-on-Workers** — FS-10 S14
   is the first measurement.
5. **No Cloudflare-side `?ct=` redaction mechanism named** — whether this plan exposes one is
   unmeasured (OD-6's first act is to look).
6. **No data-only reset mechanism** — the repo has exactly one reset, `DROP SCHEMA clara CASCADE`.
7. **No documented BELCORT re-creation path for a post-reset estate** — `onboard-rpr.mjs:295-298`
   assumes BELCORT already exists; route (a) walks the product's door instead, which is a *choice*
   (OD-10), not a documented path.
8. **No `auth.users` purge step and no Storage purge step** anywhere (OD-12 exists for that reason).
9. **The raised Supabase auth rate-limit number does not exist anywhere** (OD-19).
10. **"Sixteen steps" is never enumerated to sixteen** — the only lists name eleven (OD-15).
11. **No launch-sitting document of any kind** in the repo — no agenda, no as-run template; the only
    order text is the FS-11 order's closing clause, which is itself one of T-A's superseded texts.
12. **No go/no-go standing law in the ADR digest** — the nearest thing is
    `frontend-sprint-handoff-2026-08-31.md` §9's definition of done.

---

*Prepared read-only against `main` `f58e701e` (#538). Every state claim above was measured from the
tree or from `gh` in this session, never from `PROGRESS.md`'s banner. Where the repo is silent, §6
says so.*
