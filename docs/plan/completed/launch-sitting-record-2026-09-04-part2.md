*Part 2 of 3 of the beta launch-sitting record (2026-09-03 → 09-04) — filed VERBATIM at the final clock-out truing. **Parts 1 and 2 are the sitting's PREP template, written before the walk; part 3 is the sitting AS IT HAPPENED and governs on any divergence.** Previous: `launch-sitting-record-2026-09-04-part1.md` · Next: `launch-sitting-record-2026-09-04-part3.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

**为什么**：写 "RM0" 客户读成"免费"，而 beta 不是免费，是**还没定价**。

`[ ]` as read: ____________

### Act 4 — The operator page after `is_operator` · 打开 operator 标志之后的运营页

**EN.** Sign in as a BELCORT **owner** and open **`/admin/registrations`**. See the operator
navigation appear and the registration queue render — including the paid-but-unclaimed
registrations. Then sign in as **anyone else** (a non-operator firm's owner, or a BELCORT admin) and
confirm the entry is **not there**: the door carries **BOTH** gates, the owner floor **AND** the
operator-firm predicate.

**中文.** 用 BELCORT 的 **owner** 账号登录，打开 **`/admin/registrations`**：应该能看到运营方的导航条目和
注册申请队列，包括"已付款但还没认领"的那些。然后换**别人**登录（别家事务所的 owner，或者 BELCORT 的
admin），确认这一项**根本看不到**——这道门要同时过两关：owner 级别 **和** 运营方事务所。**这个标志只能由
你本人跑那一次性仪式 SQL 打开**，产品里没有任何界面或 API 能打开它，这是设计如此。

`[ ]` as read: ____________

### Act 5 — The password-recovery arm · 找回密码那条路

**EN.** Two parts, and the first is a **read, not a screenshot**. ① Through the **Management API**,
confirm the *Reset password* template is **still a LINK template, unchanged** — it must NOT have
been switched to a bare token, because `/auth/recover` spends a `?code=` through
`exchangeCodeForSession` and a code-only mail dead-ends there. ② Then **walk it once on the real
origin**: request a reset, receive the mail, **click the link**, land on `/auth/recover`, set a new
password, and sign in with it. *(This box has been parked in "the pending FS-10 notes" — a document
that does not exist — since the checklist was written. **The walk is its permanent home**; the final
truing gives the box a real one, T-E.)*

**中文.** 两件事，第一件是**读回来**、不是截图。① 用 Management API 读一次，确认"重设密码"的邮件模板
**还是带链接的那一版、没被改**——不能换成只有数字的那种，因为 `/auth/recover` 要靠链接里的 `?code=` 才能
换出会话，只给数字这条路就断了。② 然后在**正式网址上真的走一遍**：申请找回密码 → 收到信 → **点链接** →
落到 `/auth/recover` → 设新密码 → 用新密码登录进去。

`[ ]` as read: ____________

### The owner's other acts — decisions, statements and console work

| | act | ruling | `[ ]` | as read |
|---|---|---|---|---|
| ① | **DS-07 ruled** — the design repo's SHIPPED component is authoritative | **裁-167** | `[ ]` | |
| ② | **The two design-repo recut PRs ruled** — deferred with a dated Backlog row | **裁-168** | `[ ]` | |
| ③ | **Acknowledge in one line** that 裁-133 and 裁-111 stay **suspended, not repealed**, decided at the next session's start | **裁-171** | `[ ]` | |
| ④ | Confirm the three **REPORTED** Mail items were read back — **and state the raised Supabase auth rate-limit number**, which no document records | **裁-169** | `[ ]` | |
| ⑤ | **Accept in writing the TWO rate-limit numbers** that stand in for 裁-102's missing server-side wall: the **Resend plan's cap** (with the plan name) and ④'s number. **Both read back by Management API / the Resend dashboard at the walk — never from memory or a screenshot.** **Tripwire: if the read-back value is disproportionate (hundreds per hour), the walk stops and asks whether to lower it before accepting** | **裁-169** | `[ ]` | |
| ⑥ | **State BELCORT's SST registration status** on the record → **NOT registered**, so Stripe Tax stays OFF by a fact | **裁-170** | `[ ]` | |
| ⑦ | **Confirm the `age` identity is in hand** — the no-PITR residual only has a recovery path behind it if it does. **裁-163 rules the latest R2 bundle is NOT decrypted tonight**, so "the bundle actually decrypts" stays **unproven** and rides Backlog row 21 | **裁-163 / 裁-171** | `[ ]` | |
| ⑧ | **State the date of the pre-reset restore** that discharged G3 | 裁-163 | `[ ]` | |
| ⑨ | Confirm the `whsec_`, the Supabase PAT and the healthchecks ping URL moved **env-to-env, never printed** — **the repo is PUBLIC** | 裁-135 | `[ ]` | |
| ⑩ | **Accept §3's knowingly-open list out loud**, item by item, the two beta-shape ones first | **裁-171** | `[ ]` | |

**The two rate-limit numbers, as read:**

| | number | value as read | `[ ]` |
|---|---|---|---|
| 1 | the **Resend plan's** daily/monthly cap, quoted with the plan name | plan `__________` · cap `__________` | `[ ]` |
| 2 | the **Supabase Auth email rate limit** as raised on 2026-09-03 | field `__________` · value `__________` | `[ ]` |

`[ ]` **Accepted in writing as the wall.** 裁-102 closes as **SUBSTITUTED**, not repealed.
as read: ___________________________________________________________________

---

## 5 · THE DECISION

> Read the four blockers back first, then decide.

| | blocker | state as read | `[ ]` |
|---|---|---|---|
| 1 | **G1 — the Mail launch gate** (裁-146 point 3) | | `[ ]` |
| 2 | **G4 — the agentic walk's arms (a) and (b)** (裁-164) | | `[ ]` |
| 3 | **G3 step 1 — the restore-proof gate** (裁-163) | | `[ ]` |
| 4 | **G2 — the eleven security lines, all accounted for** (four via 裁-153) | | `[ ]` |

### **BETA LIVE: GO / NO-GO**

**The owner's words, pasted verbatim:**

```
____________________________________________________________________________

____________________________________________________________________________
```

| | value |
|---|---|
| **Verdict** | **GO** / **NO-GO** — circle one |
| Date and time (from `date`) | `____________________` |
| The launch tip's sha | `____________________` |
| If NO-GO: **the measured reason** | `____________________________________________` |

`[ ]` The verdict is recorded in `PROGRESS.md`'s **banner**, once, per the STATE-LINE rule: one
state, ONE copy. A Lanes or Next row states the STEP and the RULING and then **points at the
banner**; a sha, a verdict and an armed/disarmed fact live in the **banner only**. **A row that
restates a moving fact is the second copy, and the second copy is always the stale one.**

---

## 6 · THE FIRST HOUR — the lead's watch list

*Read all four, in this order, at ~T+5 min, T+20 min and T+60 min. **Nothing here is automated** —
the external `/ready` uptime check is not wired, so for this hour **the lead is the alarm.***

**6.1 · `/ready`.** `ready:true`, `checks.db.ok` true, note `checks.db.latency_ms`; beside it
`fly status -a clara-runtime` → the intended VERSION, `started`, checks **2/2**.
**Baseline so a standing state is not read as a new fault:** at v71, `/ready` carried **two warnings
alongside `ready:true`** — `held_outbox` **119** and the wake-engine lag — **both pre-existing**.
**Thresholds to act on:** `checks.db.ok` false for > 1 min · 2 consecutive `/ready` failures · p95
read latency > 1 s for 5 min. **A 503 right after a hard restart is usually NOT a DB fault** — stale
`idle` pooler sessions starve the new VM and never self-heal; the runbook is
`docs/ops/runtime-hard-restart.md`. **A process restart in this hour is DESIGNED behaviour, not a
defect** (裁-149).

**6.2 · Stripe problem events — the manual select** (裁-147), as the BELCORT operator owner, through
the CA-pinned bridge (**never `sslmode=no-verify`**): `list_stripe_event_problems()` (must be EMPTY
of unhandled rows) · `list_stripe_event_problems(true)` · `list_unconsumed_registration_payments()`
(**a row here is somebody who paid and cannot get in**).
**THE TRAP, and it is DF-2 exactly:** a **DOOR refusal on the webhook path stores nothing today**,
so **an empty queue is NOT evidence that no event was refused.** Read the Fly logs beside it, always.

**6.3 · Resend logs** for `mail.clarabook.com` — deliveries, bounces, complaints. Confirm the three
standing controls are still in force: **Message storage OFF**, **team log access restricted**, the
key **`sending_access`-only and domain-restricted**. **The cap that bites first is Supabase's, not
Resend's** — compare against §4's number 2.

**6.4 · Fly logs** (`fly logs -a clara-runtime`): the Stripe webhook route's **400s** (a refused
event, the one that stores nothing) and **503s** (a DSN or secret absent) · the auth-wall confirm
route's **503** (cannot reach its DB, or the service token mismatched) and **401 on every
confirmation** (`CLARA_AUTH_WALL_SERVICE_TOKEN` differs between the two apps) · **a 503 for every
applicant with nothing looking wrong in either config ⇒ the runtime's
`CLARA_TRUSTED_CLIENT_IP_HEADER` is not `X-Clara-Client-IP`.** Also read `fly logs -a clara-backup`
once — the daily pipeline's success line is the other half of G9's healthchecks read.

| | T+5 | T+20 | T+60 |
|---|---|---|---|
| 6.1 `/ready` + `fly status` | `[ ]` | `[ ]` | `[ ]` |
| 6.2 the three selects | `[ ]` | `[ ]` | `[ ]` |
| 6.3 Resend logs | `[ ]` | `[ ]` | `[ ]` |
| 6.4 Fly logs | `[ ]` | `[ ]` | `[ ]` |

---

## 7 · THE CLOSE (裁-172 · 裁-173) AND THE FINAL TRUING (裁-150)

### 7.1 · 裁-172 — the DR STRICT `4.9` replacement subject, named at the final truing

Candidates from the post-reset estate — any durable run with **both** a `workflow.workflow_runs` row
**and** its clara-side projection: the `clientOnboarding_v4` run from Product-walk item 1 · a
`chatTurn_v17` run from item 5 · a render job from item 6.

**Never the pinned ids.** The final truing writes the subject's ids into `DR-full-drill.md`'s `4.9`
line. **If `dr-verify-checks.mjs` hard-codes the canary — it does, at `:398-399` and `:414-415` —
that is a CODE change → a Backlog row naming the file, not a hand edit on launch night.** If no
candidate qualifies, `4.9` is recorded **UNPROVEN IN THE FIELD** with a Known-issues row —
**never a silent skip**.

`[ ]` Subject named, or UNPROVEN IN THE FIELD recorded.  as read: ____________

### 7.2 · 裁-173 — the close housekeeping, handed over

| | act | actor | `[ ]` |
|---|---|---|---|
| the two untracked repo-root PNGs (`fs2-01-login.png`, `fs2-02-login-focus-email.png`) | **DELETED at the ruling** — `git status` no longer lists them | `[ ]` |
| removal of the **locked worktree shells** — enumerated by a **walk** of `.claude/worktrees/` + `git worktree list --porcelain`, **reparse points unlinked FIRST**, then `git worktree remove`, then `git worktree prune` | **[O]**, elevated PowerShell at the pause window; **the lead supplies the exact commands in `housekeeping-worktrees.md` and hands them over in chat** | `[ ]` |
| **`Optimize-VHD`** (or `diskpart compact vdisk`) on the WSL distro's `.vhdx`, together with a Claude Code restart | **[O]**, same window | `[ ]` |
| **the lead's own share** — every removable worktree (merged lanes), `packages/runtime/node_modules/.cache` + `.nitro`, rigs **by exact name**, the conductor and the monitors torn down | **[L]**, all **by a walk**, receipted in the final truing | `[ ]` |

**The teardown census is a WALK, never a list.** Three estate lists name **four distinct** locked-shell
ids and they disagree; the walk settles it. **Rigs:** census `docker ps -a` and act **by exact
name** — `preview-postgrest` and `preview-rig` are **NOT ours to touch**; **one teardown registrant
per resource**, and a FORCE drop only **after an awaited close**. **The conductor:** stop the
detached serial conductor **explicitly** — it is designed to outlive a session cut and did. Confirm
**no armed PR is left in its queue**, then kill it **by its spawn-handle PID, never by a CommandLine
name match** (a name-kill on `--test-concurrency` once matched every lane's db suite). **Release the
WSL keeper LAST**, after the final rig is down. **The parked CI fleet:** complete the `config.sh
remove` un-registration and re-run the container census; **they must never be re-pointed at
`pull_request` while the repo is public**.

### 7.3 · The FINAL clock-out truing — **T-A … T-I, by name**

*裁-150 point 4: two truings remain — truing-4 (**landed as #538 `f58e701e`**) and this final one.
**The session ends after it.***

| | item | `[ ]` |
|---|---|---|
| **T-A** | the three texts still saying "switch Stripe to LIVE / a non-zero test price at the launch sitting" → re-cut to 裁-126/裁-148, and disambiguate 裁-126's "the launch sitting re-creates the objects in live mode" = **the REAL-MONEY SWITCH** | `[ ]` |
| **T-B** | `security-pass-2026-09-02.md` items 4 and 5 cite `0161`; the auth-wall pair is minted by `0163`. Same at `checkout-pools.mjs:45` (a code-comment rider — **never a separate code PR for a comment**) | `[ ]` |
| **T-C** | the apply span — PROGRESS's banner and the orders say `0154`…`0164`; **the reset re-applies all 159, `0001`→`0164`** | `[ ]` |
| **T-D** | `DR.md:397-402`'s owner-run classifier — file the **裁-162** supersession **with its beta-live expiry**, scoped to test data | `[ ]` |
| **T-E** | the *Reset password* LINK-template box → a permanent home in the checklist's signup-gate section (**"the pending FS-10 notes" does not exist**) | `[ ]` |
| **T-F** | the **evaluator re-deploy obligation** → a checklist line beside the reset lines; **never `--lock-deployed`**. **T-F's own "nine runs" needs re-cutting** — see §8 | `[ ]` |
| **T-G** | the FS-10↔FS-11 posture — **ANSWERED by 裁-156/157** (no soak; switch + delete gated by S21; no maintenance page; a recorded window) | `[ ]` |
| **T-H** | doc lines stale after **#539** — the checklist's `vars`-block lines and the four-name secret proof, the orders' lumped `vars` names, the intake-storage incident's live FIX instruction, and two research files that are **historical: date-stamp, never rewrite** | `[ ]` |
| **T-I** | the rulings **裁-151…174** into the `-09-03` ledger + the rulings digest, **with dissent lines for 156, 158, 161 and 163**; the checklist's new **step 4b**; the no-soak / no-maintenance-page posture; the "sixteen steps" re-cut; the DS-07 row's owner and next step; the two rate-limit read-back lines; the SST fact; the agentic Product-walk items; and every Known-issues row minted tonight | `[ ]` |

**Plus the standing clock-out obligations:**

| | item | `[ ]` |
|---|---|---|
| `PROGRESS.md` **posture** flipped to **BETA LIVE** (or **NO-GO** with the measured reason), obeying the STATE-LINE rule | `[ ]` |
| **every Known-issues and Backlog row carries owner · next step · ruling number** — walk §3's rows and give each one all three | `[ ]` |
| the **launch facts, written once, in the banner**: the verdict and its date · the tip's sha · the two as-run paths · the Mail certification · the first sealed artifact's manifest line and the pre-walk `report_artifacts` count · the pre-reset restore's date · **the Stripe posture in one clause (sandbox, MYR 0, whole beta)** | `[ ]` |
| the **pre-上市 roadmap as an ORDERED Backlog list**: pricing sitting (裁-58) → billing tier tranche (裁-144) → the lawyer pass (裁-125) → the real-money switch + KYB + the non-zero checkout walk. Beside it the post-beta product PRs already ruled: **裁-147** the operator screen, **裁-149** the pool error contract | `[ ]` |
| **harness-sync sweep** over every menu file — `AGENTS.md` (the 裁-133 / 裁-111 clauses re-stated as *suspended, decided next session*; the CI paragraph's latest sweep verdict; **the ledger pointer to the newest ruling file**) · `docs/adr/README.md` + a dated `README-log.md` line per ruling (裁-140: a digest row plus an "amended by" line, **never a new ADR**, each stating its TIME BOX) · `docs/product/PRD.md` (**including 裁-166's `:290` re-cut**) · `docs/ARCHITECTURE.md` · `EVALUATION_RUBRIC.md` · `docs/ops/DR.md` (the new drill dates) · `docs/ops/wave-g-setup-checklist.md` (**every box ticked with its named proof or moved to a row**) · `docs/plan/index.md` (the new as-runs filed under `docs/plan/completed/`) · `packages/db/README.md` (**the applied frontier: 159 / `0164_checkout_gate_c6_web_reads`**) · `packages/runtime/README.md` · `apps/web/README.md` | `[ ]` |
| **the ledger entry for this sitting**, continuing the chain, each file continuing at the previous one's 500-line ceiling | `[ ]` |
| **grill the owner** on any ambiguity or foreign change found and not resolved | `[ ]` |
| **the paperwork is PUBLIC** — no secret, DSN, `whsec_`, ping URL or PAT value anywhere. Hashes and redactions only | `[ ]` |
| **memory refresh — lessons and preferences ONLY, never state.** Candidates: the dispatch-model-law file (裁-133's "suspended until beta live" now needs the 裁-150 nuance: *decided at the next session's start*) · the operating-model file · new lessons from FS-10, FS-11 and this sitting, in the Why / How-to-apply shape | `[ ]` |
| **re-index the codebase graph** if code changed materially across FS-10/FS-11 | `[ ]` |

### 7.4 · The last message to the owner

*One message, after the truing merges and the teardown is done. It is the handover, so it says where
things are and nothing else — **no next steps, because 裁-150 point 2 rules there are none.***

1. **The verdict and the tip** — BETA LIVE (or NO-GO with the measured reason), the sha, the time.
2. **What is live** — the origin, the Stripe posture in one clause (**sandbox, MYR 0, whole beta**),
   the Mail gate's certification, the operator flag, the first sealed artifact.
3. **The rulings taken tonight** — 裁-167 and 裁-168, each with where it is recorded (digest row +
   `README-log.md` line + ledger entry).
4. **Where everything else lives, and that it is complete** — `PROGRESS.md`'s **Backlog** (the
   ordered pre-上市 roadmap first) and **Known issues**, every row with **owner · next step · ruling
   number**. **Name the count of rows**, so the completeness claim is a measurement.
5. **What was torn down** — worktrees, rigs, the conductor, the monitors, the CI fleet — and the
   **short list only the owner can finish**: the elevated-shell worktree removal after a Claude Code
   restart, the vhdx compaction, and the two design-repo recut PRs (裁-168).
6. **The one sentence that closes it:** *"No lane is running and none is queued. The next session
   starts when you ask, from `PROGRESS.md`."*

`[ ]` Sent.  as read: ____________

---

## 8 · CONTRADICTIONS CARRIED INTO THE SITTING — flagged, not resolved

1. **The evaluator count.** The prep, the order-under-the-rulings and truing item **T-F** all say
   **"nine"** `deploy-evaluator-version.mjs` runs. **Measured at `9d5d844e`:** `frozen-evaluators.json`
   carries nine entries at `deployed: true`, but those are **function names**; only **eight**
   `clara.evaluator_versions` rows exist across all 159 migrations, three manifest entries map to
   **no row of their own** (`evaluate_fs_pack_v1` is a closure member of `evaluate_metric` v1;
   `evaluate_sst_watch` and `evaluate_sst_watches_all` predate the registry), and **two rows are
   absent from the manifest** (`assess_metric_cell_independent` v1, `prepayment_schedule` v1 — the
   latter `deployed=false` on live). **The number of deploy acts is knowable only from a pre-reset
   read**, which is why FS-11 gains step 3b.2. **T-F's text needs re-cutting.**
2. **Three sweep run ids across three records** — §0's note. Read the id actually dispatched.
3. **裁-163's instrument citation.** The ruling names `dr-verify-checks.mjs` (the checks module); the
   runner is `dr-verify.mjs`, and **there is no `--subset` flag** — the subset is what runs with
   `CLARA_DR_STRICT` unset. It also needs a **live read-only SOURCE** beside the throwaway TARGET,
   because a self-comparison is refused.
4. **Who runs the throwaway's password ceremonies.** 裁-163 assigns the restore-proof to the **lead**,
   but `DR-full-drill.md:128-146`'s post-restore chain includes `write-login-ceremony.sql` and
   `read-logins-ceremony.sql`, which mint passwords — an `[O]` class under 裁-162. On a **throwaway**
   the passwords are throwaway, and `DR.md:401-402` grants the agent a throwaway PG17 explicitly.
   **Default in the FS-11 template: the lead runs them. Confirm in one line with the owner.**
5. **G9's monthly-light discharge.** The launch prep says the pre-reset restore discharges the
   overdue monthly-light cadence. **裁-163 route B breaks that** — the local dump is not an R2
   bundle, so the cadence stays overdue and rides Backlog row 21. The prep's sentence is superseded.
6. **G8's "the terms row in force".** The prep demanded a positive read that the terms row is in
   force. **裁-166 rules the terms are NOT in force at beta**, so the expected read is the opposite:
   the DPA only, no terms row, no `kind` column. Superseded, not unresolved.
7. **The DPA file now carries TWO canonical bodies** (v1 seeded, v2 **not** seeded) where the prep
   expected one line of output. Re-measured above in G8.
8. **`PROGRESS.md` line anchors in §3 are stale by construction** — the truing lane is editing that
   file tonight. Find each row by its **name**.

---

*Prepared read-only at `origin/main` `9d5d844e`. No live command was run, no secret read or printed.
Every claim is anchored to a file actually read at that sha, to a ruling record named by path, or is
marked as a contradiction carried forward.*
