*Part 3 of 3 of the FS-11 Wave-G reset PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs11-wave-g-reset-prep-2026-09-03-part2.md` · Next: none (this is the last part).*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

  (`docs/ops/wave-g-setup-checklist.md:19`). *Proof:* a screenshot or export of the key's scope +
  domain restriction. Measured 09-03: exactly ONE domain, `mail.clarabook.com`, status **Verified**
  (`:14-18`).
- **[O] Message storage OFF** in the Resend dashboard (`:20-21`) — *"the invite link's `?ct=` bearer
  token sits in the request body; do not let Resend retain it."* *Proof:* the storage setting.
- **[O] Team log access RESTRICTED** (`:22-23`) — the Logs API/dashboard is the same
  body-and-ingress exposure named at P4-4 round 3 (H1). *Proof:* the log-access setting.
- **[O] Proof line for the whole section** (`:85-87`): the key's scope + domain restriction, the
  storage/log settings, **a Management API read of the SMTP configuration and the rate limit (values
  redacted)**, and the **received non-team confirmation message with its timestamp** — all attached
  to the Wave-G as-run.

---

**Step 18 · [O] OTP expiry → 60 minutes, the auth receipts, and the second 裁-147 read.**

Only now, because 裁-131's box is ticked *only after C-5's attempt wall is LIVE*
(`docs/ops/wave-g-setup-checklist.md:163-174`). `PATCH /v1/projects/{ref}/config/auth` with the
owner's PAT (project ref `bzecqklouchkmdmdxlln`, `docs/ops/DR.md:48`).

*Positive read:* a Management API **read** showing `mailer_otp_exp = 3600`, plus the C-5 as-run
naming the wall (`:174`). Same pass: `jwt_exp = 900`, the redirect allowlist (exactly
`<origin>/auth/confirm` and `<origin>/auth/recover`, **no wildcard**), confirmation ON / autoconfirm
OFF, password policy 12 + HIBP (`:147-177`).

**And the 裁-147 cutover read** — the same select as 15.0, run again **at cutover**: the Stripe
problem list must be EMPTY of unresolved rows before the cutover proceeds
(`…/scratchpad/truing/ruling-147.md` point 2).

---

**Step 19 · [L] Close — and the handover 裁-150 asks for.**

Destroy every sleeper (`fly machine destroy … --force`) and record it as an explicit step, never an
assumption (`docs/ops/ceremony-practices.md:83-86,108-113`); stop `clara-backup`'s machine if it was
started rather than spawned; drop the step-2b throwaway PG17; re-read `fly status` + `/ready`.

Then the as-run at `docs/plan/completed/wave-g-reduced-asrun-2026-09-XX.md` (the FS-11 order's own
filename, `:487`), carrying **every** proof artifact (裁-122,
`docs/ops/wave-g-setup-checklist.md:232-233`), the two 裁-136 lines **as captured at 15.4** (not
reconstructed here), the D-1…D-5 rulings, and the truing lines T-1…T-4.

**裁-150's requirement, which is what makes this a handover rather than a close:** every unresolved
item this ceremony produced goes into `PROGRESS.md` as a **Backlog** row or a **Known-issues** row
carrying **its owner, its next step and its ruling number** — the repo is the system of record and
`PROGRESS.md` is the state authority (constraint 8). *After the beta-live e2e this session closes and
no next lanes are dispatched* (`…/scratchpad/truing/ruling-150.md`). Candidates known in advance:
the DR `4.9` canary subject (D-2), the auth/Storage residue (D-3), the "not shipped" verdicts from
step 16, the unenumerated five of the sixteen (§12 item 10), and 裁-147/149's post-beta PRs.

---

## 5. Rollback

**Trigger:** any step 4–8 failure that leaves the catalog unusable, or a post-reset read that
contradicts its expected value and cannot be explained.

**Preconditions before a rollback opens — both, positively read:**
1. **The owner's `age` identity is in hand and the bundle decrypts.** It is **owner custody,
   off-repo AND off-R2** (`docs/ops/DR.md:376-381`); without it an R2-sourced bundle is inert. A
   locally-held step-2a bundle does not need it — say which one is being restored.
2. **Step 2b passed** — this bundle was already restored once into a throwaway. A rollback is not the
   moment to discover it cannot be.

**The path is the FULL-profile restore, not a re-run** — the runbook is `docs/ops/DR-full-drill.md`
§3, and its **POST-RESTORE CEREMONIES checklist (`:128-140`) is enumerated here verbatim, because
none of them is carried by the dump** (pass 1 stopped at "the post-restore ceremonies", which hid
exactly the two that cover the Storage half):

```
roles-bootstrap.sql   -> (restore-full runs it)   recreate the clara-custom roles (19 at 265a8ee7; count the file, not this line)
<full restore>        -> restore-full             schema+data+owners+GRANT/RLS matrix
storage-provision.sql + firm-docs bucket + bytes  Storage recovery (out-of-band)
write-login-ceremony.sql                          write-pool LOGIN + password
read-logins-ceremony.sql                          runtime + read-pool LOGIN + passwords
acl-baseline.sql                                  public-schema ACL baseline (MANDATORY)
engine-sanity check                               workflow_drizzle == source (world-on:
                                                  REAL RECOVERY only — NEVER in a drill, step 8)
dr-verify.mjs                                     the §5 battery — all PASS
```

Three things that runbook insists on and a hurried rollback would skip:

1. **Only the full profile restores.** A default-profile dump restores postgres-owned,
   PUBLIC-EXECUTABLE functions — the write wall OPEN — and its `schema_migrations` makes a
   re-migrate a no-op that never rebuilds the wall (`DR.md:106-113`).
2. **Roles are cluster-level and are NOT in any dump** — `packages/db/deploy/roles-bootstrap.sql`
   is the restorable recreation (19 roles at `265a8ee7`; count the file —
   `packages/db/README.md:75`). It is FRESH-TARGET-ONLY.
3. **The ACL baseline is carried by no dump.** Re-applying `packages/db/deploy/acl-baseline.sql` is
   **mandatory** post-restore — a restore recreates `public` with its default PUBLIC USAGE, which
   re-opens the confined agent/wake lanes' reach (`DR.md:256-259`). *This is the same act as step 6;
   the rollback needs it again.*
4. **Storage bytes are recovered out of band** — `storage-provision.sql` → re-provision the bucket →
   re-upload the byte mirror → sha256-verify against `clara.documents.sha256`
   (`DR-full-drill.md:154-157`; dr-verify §4.10). This is the half **R-7** says nothing else covers.

**Costs to state plainly before choosing:** the managed floor is daily physical backups, 7-day
retention, **PITR NOT enabled** — so the finest managed granularity is the last daily backup
(`DR.md:46-63`); and a restore *into the same project* is a different act from the drilled one (the
proven drill restored into a **fresh** project in a separate Free org, `DR.md:203-210`).
**A rollback decision goes to the owner.**

**Cheaper partial undoes, where they exist:** step 14's flag has a documented mechanical undo
(`g1-operator-firm-ceremony.md:248-266`); step 10's two rows can be deleted as `clara_fn_owner`;
step 11's flips reverse with `alter role … nologin`; step 6's baseline is idempotent and re-runnable.
**Step 8's evaluator flips have no undo** — the transition is one-way and admitted exactly once per
row, ever (`packages/db/README.md:230-233`).

---

## 6. Owner-act list · 业主亲自动手的事

Each is an act the agent must not perform for the owner — a dashboard/console act, or a secret that
must never transit this session. *（每一条都是必须由你本人做的，不能让 agent 代做：要么是控制台里的操作，
要么是不能经过 agent 的密钥。）*

1. **Rule D-1…D-5 before the window opens** (§0). *（先把 §0 那五个问题裁掉，仪式才能开。）*
2. **Supabase personal access token available env-to-env, before the reset** — it is what makes the
   Management-API receipts (OTP expiry, `jwt_exp`, the template read, the rate limit) measurements
   instead of screenshots. Never in the repo, never printed. (`PROGRESS.md:109`; 裁-146 point 1.)
   *（准备好 Supabase 的个人访问令牌，在重置之前。有了它，OTP 时效、JWT 时效、邮件模板、限流数值这几项才算
   「真读到」，而不是截图凑数。令牌绝不进仓库、绝不打印出来。）*
3. **Verify the three custom-SMTP fields that were never read back** — port, username (must be the
   literal string `resend`, not a mailbox address), password (a Resend API key).
   (`docs/ops/wave-g-setup-checklist.md:24-46`.)
   *（把当初没看到的三格补看一遍：端口、用户名、密码。用户名必须是 `resend` 这五个字母本身，不是邮箱地址；
   密码是 Resend 的 API key。）*
4. **The three Resend console acts** (step 17): `sending_access`-only domain-restricted key ·
   **Message storage OFF** · **team log access restricted**, each with its proof.
   *（Resend 后台三件事：密钥只给「发信」权限并绑定那一个域名；关掉「保存邮件内容」；把「谁能看日志」收紧。
   每一件都要留证据。）*
5. **Create the Stripe SANDBOX webhook endpoint and set its `whsec_` yourself** —
   `fly secrets set STRIPE_WEBHOOK_SECRET=…` in your own terminal, env-to-env, never in chat.
   **Sandbox for the whole beta (裁-126)** — no live-mode switch at this ceremony or the launch
   sitting.
   *（在 Stripe 沙盒里建 webhook 端点，把 `whsec_` 用你自己的终端设进去，不要贴进聊天窗。
   整个 beta 都留在沙盒，不碰真钱账户——裁-126 已经定了。）*
6. **Set ALL NINE runtime secrets yourself** (step 12) — including the two DSNs from step 11 and the
   two values that must match `clara-web`'s. The agent's part is `fly secrets list` (names + digests)
   and comparing the two hashes you give it.
   *（那九个运行时密钥全部由你亲手设，包括两条数据库连接串，以及必须和前端一模一样的那两个值。
   agent 只负责看「名字和指纹」，以及比对你给的两个哈希值——它永远不看真值。）*
7. **Run the two role-flip password blocks in your own private session** (step 11); the agent
   supplies the script and reads back the `pg_roles` proof, which contains no secret.
   *（两个数据库角色的开通密码，在你自己的私密会话里用 `\prompt` 输入；agent 给脚本、看结果，不碰密码。）*
8. **Confirm the confirmation address (P-13)** — a real mailbox that is NOT in the Supabase project
   team and has **no existing `auth.users` row** (the reset does **not** delete auth users — D-3). A
   reused address dead-ends silently at "check your email".
   *（确认收验证码的邮箱：团队外的真实邮箱，而且从没在这里注册过。注意：这次重置不会删掉登录账号表里的老账号，
   所以用过的邮箱会静悄悄卡在「请查收邮件」，永远等不到码——这是防止别人试探账号存在的设计，不是故障。）*
9. **Receive the six-digit code at that address and confirm it on the page** — this *is* the Mail
   launch gate; nothing else certifies it (裁-146 point 3). The 16:55 *Invite user* proof does not.
   *（在那个邮箱里真的收到六位数验证码，并在页面上验证通过。这一步本身就是「邮件」这道发布闸门；
   设置截图不算、发到团队邮箱不算、16:55 那封邀请信也不算——那是另一个模板、另一条路。）*
10. **Walk the product yourself (step 16)** — seven things, with your own eyes. A failure becomes a
    Known-issues row for the launch sitting, never a silent block, and nothing is loosened to get
    past it.
    *（第 16 步那七件事你亲自过一遍眼。哪一件不行就记成 Known issue 留到发布那场谈，绝不为了走通而放松任何机制。）*
11. **Approve the rollback if one is needed** — a full-profile restore is not a lead call (§5), and
    an R2-sourced one needs your `age` identity.
    *（万一要回滚，由你批准：全量恢复不是 agent 能自己决定的；如果要从异地备份恢复，还得用你手上的解密钥匙。）*

---

## 7. Lead-act list (the agent, as the owner's delegate — constraint 14, subject to D-4)

1. P-1…P-10 and P-15 preflight reads, and the two `openssl` bridge legs.
2. Step 1's target-string discovery; step 2a's full-profile backup + off-site copy; **step 2b's
   restore-into-a-throwaway proof and its dr-verify subset**.
3. Step 3's quiesce (stop, heartbeat, session census) and step 9's restart.
4. Steps 4–8: reset · migrate · **acl-baseline** · seed · the nine evaluator flips — each with its
   positive read, and step 4's *pre*-read.
5. Step 10's `stripe_object_map` OPS ACT as `clara_fn_owner`.
6. Step 11's script and its `pg_roles` verification (the passwords are the owner's).
7. Step 12's `fly secrets list` / `wrangler secret list` **names-and-digests receipt** and the
   **hash comparison** of the pepper and the service token. **No secret value.**
8. Step 13's manual browser walk from a written script; step 14's `is_operator` UPDATE and its three
   verification reads.
9. Step 15's five sub-reads (15.0 the Stripe-problem select · 15.1 the series pick + its measurement ·
   15.2 the 资料缺失 marks · 15.3 the parts union · **15.4 the two 裁-136 one-shot reads at the right
   moment**).
10. Step 16's instruments beside the owner's eyes, and every "not shipped" census.
11. Step 19's sleeper destruction, the throwaway drop, the as-run under `docs/plan/completed/`, and
    **the PROGRESS Backlog/Known-issues rows 裁-150 asks for**.

---

## 8. What each step proves, in one table (the instrument, not the intention)

| Step | Positive read | Where the shape is defined |
|---|---|---|
| 2a | dump path + size, `Dumped by pg_dump version 17.x`, four schemas | `DR.md:104-148`, `backup.mjs:1-33` |
| 2b | roles-bootstrap + `restore:full` into a throwaway PG17 + dr-verify's schema/manifest-floor/AP-gate subset PASS | `DR.md:431-436`, `DR-full-drill.md:128-140` |
| 3 | machine stopped · non-idle `clara_%` sessions **0** · heartbeat > 90 s | `wave-c-c-0040-…:19-28`, `DR.md:284-291` |
| 4 | pre-read `clara` PRESENT + 148 rows; then `to_regnamespace('clara') is null` → true; the other four schemas present | `reset.mjs:63-80` |
| 5 | `159 / 0164_checkout_gate_c6_web_reads` from `clara.schema_migrations` | `packages/db/README.md:138-160` |
| 6 | `ACL baseline verify: OK`; eleven confined roles `usage_public=f, temp_db=f`; `clara_runtime` keeps both | `acl-baseline.sql:163-200`, `security-pass-2026-09-02.md:554-559` |
| 7 | seed sentinel user present; two synthetic firms | `0002_core_seed.sql:15,31-34` |
| 8 | nine `deployed = true` rows; freeze verify clean | `packages/db/README.md:222-241`, `0060:93` |
| 10 | two `stripe_object_map` rows; later, `open_checkout_intent` without CLR10 | `wave-g-setup-checklist.md:184-189`, `0163:465-476` |
| 11 | `_login` roles `rolcanlogin=t`, all capability columns `f`; groups still NOLOGIN; roster still `usage_public=f` | `0160:855-861`, `0163:1099-1109`, `acl-baseline.sql:197-200` |
| 12 | secret **names + digests** only; **hash-equality** of the shared pepper/token across apps | `wave-g-setup-checklist.md:132-138`, `DR.md:397-402` |
| 13 | `stripe_events` row · payment row · new firm · Stripe 2xx · route 200 · what a MYR 0 session collected | `0160:275+`, `0163:465+`, 裁-148 |
| 14 | one row `BELCORT`/true · `uq_firms_one_operator` indexdef · `count = 1` | `g1-operator-firm-ceremony.md:169-198` |
| 15.0 | `stripe_event_problems` unresolved → EMPTY (raw select before step 14's flag; the door after) | `0160:562-576,580-635`, 裁-147 |
| 15.1–15.2 | the series pick + its coverage measurement; the four 资料缺失 marks | `wave-g-setup-checklist.md:224-229` |
| 15.4 | `report_artifacts` count **0** before the first render; the first manifest's `extraction_tool` names `-raw` | `wave-g-setup-checklist.md:246-254` |
| 16 | seven owner-eyes lines, each with a screenshot/receipt; each "not shipped" naming its census | checklist § Product walk (truing-4, PR #538) |
| 17 | the received six-digit code at a non-team address, verified on the page; the three Resend proofs | `wave-g-setup-checklist.md:79-87` |
| 18 | Management API read `mailer_otp_exp = 3600`, `jwt_exp = 900`; the cutover Stripe-problem read | `wave-g-setup-checklist.md:163-177`, 裁-147 |

---

## 9. Risks

*(The open DECISIONS moved to §0. What remains here is risk — things to watch, not things to rule.)*

**R-1 · The canary's clara-side rows die with the schema.** Mechanics and citations in **D-2**. Once
D-2 is ruled, this is a recorded loss with a Known-issues row, not a risk.

**R-2 · `is_operator` is mis-ordered in the stated plan** — §1.2. Resolved in this prep: it is step
14, after the round trip. Watch for any sibling document that still puts it before.

**R-3 · Two repo texts still contradict 裁-126/裁-148** — truing lines **T-1** and **T-2**. A reader
following either would either switch Stripe to live mode or hunt for a non-zero price that this
ceremony deliberately does not mint.

**R-4 · Nine evaluators go dark and it is written down nowhere in the checklist** — §1.3. The flip is
one-way per row and has no undo, and step 16 line 6 (a report renders) **fails if step 8 is skipped**.

**R-5 · The pepper and the service token couple two apps deployed at different times.** FS-10 puts
`apps/web` on Workers *before* FS-11 and mints both values there (P-17); the identical values must
reach the runtime here. Mismatched pepper splits one rate wall into two that never see each other's
counts; a mismatched token 401s every confirmation
(`docs/ops/wave-g-setup-checklist.md:110-128`). **The hash-equality proof cannot run at FS-10 —
the runtime holds neither value until step 12 — so it is executed HERE.**

**R-6 · `CLARA_PUBLIC_ORIGINS` has no declared home on the Workers deploy** — `wrangler.jsonc`
declares no `vars` block (`docs/ops/wave-g-setup-checklist.md:134-138`, "worth its own look before
Wave-G"). Also required, and **owned by FS-10, not this record**: prove the courier **fails closed**
under a deliberately-**unset** probe first, not merely that the value is set (`:95-99`).

**R-7 · Supabase Storage objects and `auth.users` are not reset by anything here** — mechanics in
**D-3**. `db:reset` is schema-scoped, so `firm-docs` bytes survive while `clara.documents` does not
(orphaned objects; DR probe `4.10` has nothing to tie them to), and every test login survives while
its `clara.users` row does not.

**R-8 · The runtime's TLS posture for the two new DSNs is undocumented.** `checkout-pools.mjs:93-114`
uses the DSN string as given; the bridge's `verify-full` pin governs *ceremony tools*, not the
runtime. Read the app's existing DSN's `sslmode` env-to-env and match it; never `no-verify`
(`docs/ops/dsn-bridge.md:3-9` — this exact mistake happened twice before).

**R-9 · Windows is not the ceremony surface.** `docs/ops/dsn-bridge.md:169-175`: every documented
recipe assumes a POSIX shell; WSL2 is the ceremony home. Do not adapt these pipes to PowerShell
without re-proving the argv/disk cells there.

**R-10 · Supavisor headroom is an open cutover item, not a settled number.** `checkout-pools.mjs:59-65`
says the README's ≈27 count carries a standing UNVERIFIED warning since the F-A4/FS-4 trains landed;
the two new pools add ≈4. Measure at P-7, do not quote.

**R-11 · A no-op reset would be silent.** If the guard's target string is stale or the DSN resolves
elsewhere, `reset.mjs:63-68` short-circuits with *"schema \"clara\" does not exist — nothing to
drop"* and exits **0**. Step 4's **pre-read** (clara PRESENT, 148 rows) plus its post-reads are what
tell a successful reset from a wrong-target no-op.

**R-12 · The operator problem-event door is not callable before step 14.** `list_stripe_event_problems`
requires an owner-rank JWT on an `is_operator` firm (`0160:562-576`), which does not exist until
BELCORT is minted and flagged. 15.0 therefore uses the raw select — the alternative 裁-147 names.
Do not read the door's `CLR04` as "no problems".

**R-13 · The remote walk has no repo instrument.** `apps/web/e2e/run.mjs:14-28` serves a LOCAL build
and mocks Supabase; nothing in the repo walks a remote origin. The walk is manual-from-a-script by
necessity, and the as-run must say which instrument was used (step 13).

---

## 10. Sequence, at a glance

```
P-1…P-17  →  1 target string  →  2a backup  →  2b RESTORE-PROOF into a throwaway
   →  3 quiesce (stop 48ee715b763048)
   →  4 RESET (drop schema clara cascade)      [pre-read + post-reads]
   →  5 MIGRATE 0001…0164 (159)
   →  6 ACL BASELINE + its VERIFY               ← NEW
   →  7 SEED (synthetic)
   →  8 nine evaluator re-deploys                (one-way, no undo)
   →  9 start runtime, /ready 200
   → 10 stripe_object_map OPS ACT
   → 11 two NOLOGIN→LOGIN flips [O passwords]
   → 12 nine runtime secrets [O] + hash compare [L]
   → 13 SANDBOX ROUND TRIP (mints BELCORT, route a)  [manual browser walk]
   → 14 is_operator = true
   → 15 CORPUS WALK  (15.0 stripe problems · 15.1 series pick · 15.2 资料缺失 ·
                      15.3 parts union · 15.4 裁-136 BEFORE the first render · 15.5 the 11 named steps)   ← NEW
   → 16 PRODUCT WALK (seven owner-eyes lines)   ← NEW
   → 17 Mail certification + the three Resend acts
   → 18 OTP 60 min + auth receipts + the cutover stripe-problem read
   → 19 CLOSE: sleepers destroyed, as-run written, PROGRESS rows filed (裁-150)
```

---

## 11. Fold ledger — what pass 2 changed and why

| Finding (critic pass) | Where it is now | Instrument added |
|---|---|---|
| BLOCKER — no corpus-walk step | **§4 step 15** | `wave-g-setup-checklist.md:221-229`; `orders:484-487`; `clarabook-conformance-pass-3-2026-09-02.md:53` |
| HIGH — the whole Resend half missing | **§4 step 17** + §6 act 4 | `wave-g-setup-checklist.md:19-23,85-87` |
| HIGH — no `acl-baseline.sql` step | **§4 step 6** (+ §5 item 3) | `acl-baseline.sql:163-200`; `security-pass-2026-09-02.md:554-559`; `DR.md:256-259` |
| HIGH — secrets mis-assigned to the lead | **§4 step 12**, every row **[O]** | `DR.md:397-402`; `fs10-cutover-prep.md:136-146` |
| HIGH — destructive authority collision unnamed | **§0 D-4**, P-16, step 4's authority note, T-3 | `DR.md:397-402` vs `AGENTS.md:78-84` |
| HIGH — "Playwright" named no instrument | **§4 step 13**, R-13 | `apps/web/e2e/run.mjs:14-28`; `fs10-cutover-prep.md:190-192` |
| HIGH — restorability was three evasions | **§4 step 2b** (monthly-light shape) | `DR.md:431-436`, `:186-192`; `DR-full-drill.md:128-140` |
| HIGH — route (a) vs FS-4's acceptance line | **§0 D-1** + **P-15** (FS-4 CLOSED, `aa789d65`) | `apps/web/app/(entry)/signup/page.tsx`; `proxy.ts:62-72`; `orders:459-461` |
| MEDIUM — no non-zero price to walk | **settled by 裁-148**, step 10's note + T-2 | `ruling-148.md`; `wave-g-setup-checklist.md:190-193` |
| MEDIUM — rollback stopped at "the ceremonies" | **§5**, chain quoted verbatim + the `age` precondition | `DR-full-drill.md:128-140,154-157`; `DR.md:376-381` |
| MEDIUM — 裁-136 filed at the close | **§4 step 15.4**, before the first render | `wave-g-setup-checklist.md:246-254` |
| Extra order — auth/Storage purge | **§0 D-3**, step 4's recorded consequence | `DR-full-drill.md:149-157`; `signup-account-form.tsx:185-194` |
| Extra order — the PRODUCT WALK | **§4 step 16** | checklist § Product walk (truing-4, PR #538) |
| Correction — #517 merged, FS-4 closed | banner, §0 D-1, P-15 | `git log` → `aa789d65`; `ls migrations \| wc -l` → 159 |
| Correction — the reset shape | §1.1, step 4, step 5 | `reset.mjs:1,63-80`; `migrate.mjs` |

---

## 12. notFound — asked for, and not in the repo

1. **Whether the runtime machine is stopped during the apply is NOT in
   `docs/ops/wave-g-setup-checklist.md`.** The file has no quiesce, machine-stop, session-reap or
   restart line anywhere; its only data-safety section is `:261-269` (the backup, and `0155` after
   the reset). The obligation comes from `packages/db/README.md:165-184` (D1),
   `docs/ops/ceremony-practices.md:14-50`, and the precedent
   `docs/ops/wave-c-c-0040-ceremony-checklist.md:24-37`. **The checklist should gain the line.**
2. **No FS-11 runbook exists.** There is no `docs/ops/wave-g-*-ceremony-runbook.md`; the checklist
   is a proof tick-list, not a sequence with commands. This prep is assembled from the recipe files
   plus the two precedents.
3. **No data-only reset mechanism exists.** The repo has exactly one: `DROP SCHEMA clara CASCADE`
   (`packages/db/scripts/reset.mjs`). Nothing implements "keep the ledger, clear the estate", which
   is why §1.1 corrects the apply span.
4. **No documented BELCORT re-creation path for a post-reset estate.** `onboard-rpr.mjs:295-298`
   assumes BELCORT already exists on live; the create path needs a `clara.users` owner row plus an
   unconsumed admission token, and the auth-user provisioning behind it is called "a manual
   dashboard step" (`:298`). Route (a) (D-1) walks the product's door instead — which is a *choice*
   this prep recommends, not a documented path the repo names.
5. **The evaluator re-deploy obligation is absent from the checklist** (§1.3, R-4).
6. **No Supabase `auth.users` purge step, and no Storage object purge step**, anywhere in the
   checklist or the DR docs — only the reported-not-measured deletion of one test user
   (`docs/ops/wave-g-setup-checklist.md:64-71`) and the DR re-provision path (`DR-full-drill.md`
   §4). This is why D-3 is an owner decision rather than a step.
7. **The auth mail rate-limit number is unknown, not merely unverified.** The owner applied a raise
   on 09-03 and did not state the value; the checklist records no number **by design**
   (`docs/ops/wave-g-setup-checklist.md:64-67`). Step 17 records it.
8. **No documented TLS posture for the two checkout DSNs** (R-8).
9. **No repo-held value for `CLARA_RATE_WALL_PEPPER` / `CLARA_AUTH_WALL_SERVICE_TOKEN`** — by
   design; they are minted once (FS-10, per P-17) and never printed.
10. **The "sixteen-step walk" is never enumerated to sixteen.** The label appears at
    `orders:485`, `frontend-sprint-handoff-2026-08-31.md:129,287`,
    `clarabook-conformance-pass-3-2026-09-02.md:53`, `mohe-grill-rulings-2026-08-31.md:178` and
    `dashboard-web-capability-diff-2026-09-02.md:36,69,126`. The only *lists* are the two identical
    ELEVEN-milestone chains quoted in step 15.5. **The remaining five are not enumerated in the
    repo** — walk the eleven, plus step 16's product walk, and record the count honestly rather than
    inventing five.
11. **The desktop corpus itself is not inventoried in the repo.** The checklist names four gaps to
    mark 资料缺失 (`:227-229`) but no file lists what the corpus contains, so "every flow on the
    corpus" cannot be checked against a manifest. The as-run should carry one.
12. **No FS-10↔FS-11 maintenance-posture line exists anywhere** (D-5). Neither ceremony's source
    documents state whether the live origin is under a declared window while `clara` is dropped.

---

*Prepared read-only. No live command was run, no DSN piped, no secret read or printed, no migration
applied, no rig started. Every claim above is anchored to a file and line that was actually read at
`main 5eab358d`, or to a ruling record named by path. Where the repo is silent, §12 says so.*
