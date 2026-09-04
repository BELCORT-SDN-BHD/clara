*Part 1 of 3 of the FS-11 Wave-G reset PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: none (this is the first part) · Next: `fs11-wave-g-reset-prep-2026-09-03-part2.md`.*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

# FS-11 — Wave-G factory reset of the LIVE Supabase project: ceremony prep

**Status: PREP ONLY — NOT RUN.** Written read-only against `main 5eab358d` (measured 2026-09-03
≈18:5x MYT). Nothing in this file was executed: no DSN was piped, no migration applied, no secret
read, no rig started. Every line below cites the repo file that proves it; where the repo does
**not** answer, the item is in §12 "notFound / owner-owed", never guessed.

**Fold pass 2 (2026-09-03 evening).** Every finding of the critic pass that named this record is
folded below, each with a file:line instrument, plus four corrections that were unknown to the
first pass:

- **#517 MERGED as `aa789d65`** (2026-09-03 17:02 MYT; 55 files) — **FS-4 is CLOSED** and
  **`0164_checkout_gate_c6_web_reads.sql` is on `main`** (`git log --oneline -3` → `5eab358d`;
  `ls packages/db/migrations/ | wc -l` → **159**, tail `0164_…`). **`PROGRESS.md`'s banner is STALE
  on this until truing-4 (PR #538) lands** — so every state claim in this record is measured from the
  TREE or from `gh`, never from PROGRESS's banner (law 2: a derived state is not evidence).
- **The afternoon's rulings 裁-142…150** are folded (see §0 and the steps). 裁-147…150 are ruled but
  **not yet in the repo** — they ride truing-4 / **PR #538**; until it merges the citable text is the
  ruling record itself (`…/scratchpad/truing/ruling-147.md` … `ruling-150.md`).
- **The reset mechanism is `DROP SCHEMA clara CASCADE` + a fresh apply of `0001`…`0164`.** There is
  **no delta apply** anywhere in the repo (§1.1). Constraint 15 holds throughout: the
  `workflow` / `graphile_worker` / `spike` schemas are never touched.
- **裁-148 settles the price question** and **裁-126 settles the sandbox question** — both were open
  decisions in pass 1 and are now **ruled**, with two repo texts left conflicting (§0, truing lines
  T-1/T-2).

**Governing law:** `AGENTS.md:72-77` (constraint 13 — BELCORT is the OPERATOR firm, every other firm
is a resettable fixture), `AGENTS.md:78-84` (constraint 14 — DATA-scoped authority, secrets
env-to-env, **the product's security mechanisms are never weakened for testing convenience**),
`AGENTS.md:85-86` (constraint 15), `AGENTS.md:65-66` (constraint 10), `AGENTS.md:51-52`
(constraint 4 — DSNs from the environment only), `AGENTS.md:235-236` (ceremonies run from merged
`main`; a writer-body migration needs a D1 window).

**Recipe files read for this prep:** `docs/ops/wave-g-setup-checklist.md` · `docs/ops/DR.md` ·
`docs/ops/DR-full-drill.md` · `docs/ops/dsn-bridge.md` · `packages/db/README.md` ·
`docs/ops/g1-operator-firm-ceremony.md` · `docs/ops/ceremony-practices.md` ·
`docs/ops/wave-c-c-0040-ceremony-checklist.md` · `packages/db/deploy/acl-baseline.sql` ·
`docs/plan/active/security-pass-2026-09-02.md` ·
`docs/plan/active/frontend-sprint-handoff-2026-08-31.md` + `…-orders.md` ·
`docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md` ·
the sibling preps `…/scratchpad/ceremonies/fs10-cutover-prep.md` and `runtime-deploy-v17-c5.md`,
and the ruling records `…/scratchpad/truing/ruling-142.md` … `ruling-150.md`.

---

## 0. OWNER DECISIONS — the questions this record cannot answer for you

*Read this block first. Each item is a real fork the ceremony cannot take unilaterally. Nothing
below step 0 opens until D-1…D-5 are ruled.*
*（先读这一段。下面五件事 agent 不能替你决定，仪式开始前必须有你的裁决。）*

### D-1 · How is BELCORT re-created after the reset?

**Question (en):** the reset deletes every firm including BELCORT — do we re-mint it by walking the
product's own self-serve signup+checkout door (route a), or by the heavier operator step (a hand-made
`clara.users` row + an unconsumed admission token + `create_firm`, route b)?
**问题（大白话）：** 重置会把 BELCORT 这家「运营方公司」也一起删掉。重新建起来有两条路：走产品自己的
注册＋付款那道门（顺手把 beta 主流程也验了），还是走更重的「手工发准入令牌」那条路？

**Recommendation: route (a) — the self-serve door.** It exercises the mechanism instead of working
around it (constraint 14's operative clause), and it *is* the sandbox round trip, so it costs no
extra step. **The blocker that made this contentious in pass 1 is gone:** FS-10's hard acceptance
line was *"self-serve signup must be unreachable in the deployed build **until FS-4 closes**"*
(`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:459-461`) — FS-4 **is** closed
(#517 `aa789d65`), and the door is present at the tree
(`apps/web/app/(entry)/signup/page.tsx`; `/signup` is in `PUBLIC_PATH_PREFIXES`,
`apps/web/lib/supabase/proxy.ts:62-72`). P-15 re-measures it on the deployed build before step 13
opens.

**Cost:** route (a) = zero extra acts, and it reorders `is_operator` to *after* the round trip
(step 14, not step 8 — the g1 runbook's §0 refuses on zero BELCORT rows,
`docs/ops/g1-operator-firm-ceremony.md:93-109`). Route (b) = one extra hand-driven admission path
beside the one under test, plus a manual Supabase auth-user provisioning step
(`packages/db/scripts/onboard-rpr.mjs:295-298` calls it "a manual dashboard step").

**If not ruled:** step 13 cannot open — the ceremony stalls after the reset with no operator firm,
and step 14 (`is_operator`) is unrunnable by its own precondition.

### D-2 · The parked S4-V2 canary's clara-side rows are deleted by the reset — accept, or preserve first?

**Question (en):** `DROP SCHEMA clara CASCADE` removes the canary's two clara-side rows
(`clara.agent_interruptions` `daba7f2e%` and `clara.agent_tasks` `032767e6%` —
`packages/db/scripts/dr-verify-checks.mjs:399,415`) while its `workflow.workflow_runs` row survives
(constraint 15 keeps `workflow` untouched), leaving an orphaned durable run and costing every future
DR drill its STRICT `4.9` parity subject (`docs/ops/DR-full-drill.md:198`). Accept the loss on the
record, or preserve the two rows first?
**问题（大白话）：** 那个一直停在那里的 canary（`daba7f2e`），重置会删掉它在 `clara` 里的两行，而它在
`workflow` 里的那一行会留下来——变成一条「断了半截」的记录，以后灾备演练里那一项检查也就没对象了。
是接受这个损失并写进记录，还是先把它保下来？

**Recommendation: ACCEPT, recorded as an explicit as-run line.** Constraint 11 is about never
*answering* the canary and never *approving* the witness; deleting test rows is neither, and
constraint 14 makes test data resettable. Preserving it would mean hand-copying rows back into a
freshly-migrated schema — a second, un-drilled write path into audited tables, which is worse.
**A PreToolUse hook hard-blocks verbatim-id write shapes** (`AGENTS.md:67-71`,
`scripts/hooks/pinned-ids-guard.mjs`), so any preserve-and-restore attempt must be designed around
that guard rather than through it.

**Cost:** accepting = one as-run line, and the DR drill's `4.9` probe needs a new subject (a
Known-issues row). Preserving = an un-drilled write path plus hook friction.

**If not ruled:** step 4 runs and the rows are gone anyway — an undiscussed loss instead of a
recorded one. That is the failure this decision exists to prevent.

### D-3 · `auth.users` and Supabase Storage objects SURVIVE the drop — purge them, or keep?

**Question (en):** the reset is schema-scoped. Supabase's `auth` schema has **no FK from clara**
(`docs/ops/DR-full-drill.md:149-151`) and Storage bytes live outside Postgres entirely
(`:154-157`), so after the reset every test account still exists in `auth.users` and every uploaded
byte still sits in the `firm-docs` bucket, while the `clara.users` / `clara.documents` rows that gave
them meaning are gone. Purge the test auth users and the orphaned Storage objects, or keep them?
**问题（大白话）：** 这次重置只清 `clara` 这一层。Supabase 的「登录账号表」和「文件仓库里的文件」都不在
这一层，所以重置之后：以前注册过的测试账号还在，以前上传的文件还在，但它们在 clara 里对应的记录没了。
要不要把这些测试账号和孤儿文件清掉？

**Recommendation: purge the TEST auth users (at minimum the one address the walk will use), and
LEAVE the Storage objects, recorded.** Two separate reasons:

- **Auth users are not cosmetic — a stale row silently kills the walk.** `signUp` on an address that
  already has an account is normalized to the *same* "check your email" state as a fresh signup, on
  purpose, because surfacing the duplicate would be an enumeration oracle
  (`apps/web/components/entry/signup-account-form.tsx:185-194`, `isDuplicateAccountError` →
  `setStage("check-email")`). So a reused address produces a page that looks correct and a code that
  never arrives. P-13 is the guard; purging is the fix when the owner wants to reuse an address.
- **Storage bytes:** orphaned objects are harmless to the walk (fresh uploads write fresh paths) and
  deleting them is an irreversible act on a vendor surface the repo has no runbook for. Keep, and
  record the orphan count so DR probe `4.10` (storage-path integrity,
  `docs/ops/DR-full-drill.md:203-205`) has an honest baseline.

**Cost:** purging auth users = an owner dashboard/Management-API act, a few minutes; it is
irreversible for those accounts. Keeping = the walk must use a never-before-used address, and the
`auth.users` table accumulates dead test rows across resets.

**If not ruled:** if the owner reuses a previously-registered address, step 13 dead-ends at "check
your email" with no error anywhere, and the Mail gate (裁-146 point 3) cannot certify.

### D-4 · Who runs the destructive commands — the DR classifier says OWNER, constraint 14 says the agent may

**Question (en):** `docs/ops/DR.md:397-402` puts *"any restore-into-a-project (needs
`CLARA_ALLOW_DESTRUCTIVE=1` + `CLARA_DESTRUCTIVE_TARGET=…`)"* in the **owner-run** column and says
*"the agent validates only on a throwaway PG17"*. Steps 4 (reset), 7 (seed) and step 2's restore
rehearsal all use exactly that pair. Does ADR-0075 / constraint 14's DATA-scoped authority supersede
that line for **test data on this project**, or does the owner run steps 4 and 7 personally?
**问题（大白话）：** 灾备手册里写着「带 `CLARA_ALLOW_DESTRUCTIVE` 的操作是业主亲自跑」，但后来的
ADR-0075（第 14 条硬约束）又说「测试数据 agent 可以随便删、随便重跑」。这两条撞在一起了——重置和播种
这两步，是我跑还是你跑？

**Recommendation: constraint 14 supersedes DR.md:397-402 for this ceremony, in one sentence** —
*ADR-060 as widened by ADR-0075 (`AGENTS.md:78-84`) makes every firm and client on this project test
data that the agent may delete, reseed and re-run without asking, walking law-71's gates as the
owner's DELEGATE through the REAL audited doors, receipted; DR.md's classifier line predates that
widening and is not repealed for the crown-jewel items beside it (reading any live secret, the R2
token, the age identity, `gh pr merge`), which stay owner-run.* The lead therefore runs steps 2, 4
and 7; **every secret-bearing act in this record stays [O]** (§4 step 12, §4 step 11), which is the
half of DR.md:397-402 that is *not* superseded.

**Cost:** ruling for the supersession = zero extra acts and one recorded sentence + a truing line
(T-3) so DR.md says so in the repo. Ruling the other way = the owner personally runs three long
piped commands in their own POSIX shell, adding a session boundary in the middle of a quiesce
window.

**If not ruled:** step 4 opens with the agent acting against a documented owner-run line — exactly
the "the record never names the collision" failure the critic pass flagged.

### D-5 · The posture between FS-10 and FS-11 — is the live origin under a declared maintenance window?

**Question (en):** FS-10 leaves `app.clarabook.com` publicly serving the new Worker and then hands
over to FS-11, which stops the runtime and drops `clara` underneath it. Does FS-11 run inside a
declared maintenance window on the live origin, or does FS-10's soak close and get recorded before
FS-11 opens?
**问题（大白话）：** 上一场（FS-10）会把 app.clarabook.com 正式切到新前端并让它对外可用；这一场（FS-11）
要停服务、清数据库。中间这段时间对外是什么姿态——挂维护公告，还是等上一场的观察期跑完、写好记录，再开始
这一场？

**Recommendation: FS-10's soak closes and is recorded first, then FS-11 opens.** No beta user exists
yet (the first invited firm signs up *after* this ceremony —
`docs/plan/active/frontend-sprint-handoff-2026-08-31.md:287-292`), so there is nobody to show a
maintenance page to; what the sequence buys is that FS-10's rollback evidence is still valid when
FS-11 starts destroying its subject.

**Cost:** stated soak duration + one recorded line. The alternative (overlapping) risks a soak whose
evidence the reset voids.

**If not ruled:** the two ceremonies run back to back by default and FS-10's cheap rollback quietly
stops being available mid-FS-11.

### Already RULED this afternoon — not decisions, folded as law

| Ruling | What it settles for this ceremony | Where |
|---|---|---|
| **裁-126** | Stripe stays in the **BELCORT sandbox for the whole beta**. `CLARA_STRIPE_LIVEMODE=test`. Any repo text saying "switch Stripe to LIVE at the launch sitting" is **superseded** — see truing line **T-1**. | `docs/plan/active/mohe-grill-rulings-2026-09-02.md:207-217` |
| **裁-148** | Walk checkout **ONCE at the seeded beta price (sandbox, MYR 0)**; the **non-zero-price walk belongs to the real-money switch ceremony** (Stripe live mode + KYB). **No temporary current-plan switch at Wave-G.** The checklist's "non-zero test price" line is superseded — truing line **T-2**. | `…/scratchpad/truing/ruling-148.md`; rides PR #538 |
| **裁-146** | The Mail gate: custom SMTP configured ≈16:08 MYT 09-03; delivery to a **non-team address PROVEN ≈16:55** via the *Invite user* arm; the **/signup six-digit-code certification is still OWED at the walk**. | `docs/plan/active/mohe-grill-rulings-2026-09-03.md:21+`; `docs/ops/wave-g-setup-checklist.md:24-71,79-84` |
| **裁-147** | The C-2 operator problem-event **screen is post-beta**; **now**, one manual line: at the walk *and* at cutover the Stripe problem list must be EMPTY of unresolved rows. Folded as step 15.0 and step 18. | `…/scratchpad/truing/ruling-147.md`; rides PR #538 |
| **裁-149** | The runtime pool `'error'` contract is a **post-beta** product PR; today's fail-loud behaviour is safe and stands. **Nothing to do in this ceremony** — named so it is not mistaken for an owed act. | `…/scratchpad/truing/ruling-149.md` |
| **裁-150** | After the beta-live e2e **this session closes**; the repo is the handover; **no next lanes**. Every unresolved item this ceremony produces becomes a PROGRESS Backlog or Known-issues row **with its owner, next step and ruling number** — that is step 19's real product. | `…/scratchpad/truing/ruling-150.md` |

### Truing lines this ceremony owes the repo (not owner decisions — filings)

- **T-1** — `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:489` still reads *"switch
  Stripe to LIVE + the RM0 price at the launch sitting"*. **裁-126 supersedes it for the whole
  beta** (sandbox throughout); 裁-148 moves the live-mode walk to the real-money switch ceremony.
  File the conflict.
- **T-2** — `docs/ops/wave-g-setup-checklist.md:190-193` still demands *"a non-zero test price …
  A zero-amount or skipped checkout does not satisfy this line."* **裁-148 re-cuts it.** truing-4
  (PR #538) executes the re-cut; if #538 lands before the ceremony, re-read the line and drop T-2.
- **T-3** — `docs/ops/DR.md:397-402`'s owner-run classifier predates ADR-0075's widening (D-4).
  File the supersession sentence there, scoped to test data, leaving the crown-jewel items owner-run.
- **T-4** — `packages/runtime/lib/checkout-pools.mjs:45` says the auth-wall pair comes from `0161`.
  It does not: `0161` is Q-D6; the merged file that mints `clara_auth_wall_login` is
  `0163_checkout_gate_c3_folded_door.sql:165-185` (constraint 10 — numbers are claimed at merge).

---

## 1. Three corrections to the stated order — read these before anything else

### 1.1 The apply is **`0001`…`0164`**, not `0154`…`0164`

The repo's one reset mechanism is `packages/db/scripts/reset.mjs`, and its own header says it
"drops the `clara` schema (**schema_migrations** + app tables)" (`reset.mjs:1`); the act is
`drop schema if exists clara cascade` (`reset.mjs:78`). `clara.schema_migrations` is *inside* the
dropped schema, so the ledger goes with it and `migrate.mjs` then re-applies **the whole chain**:
**159 files, `0001` → `0164_checkout_gate_c6_web_reads`** (`ls packages/db/migrations/ | wc -l` = 159,
tail measured `0164_checkout_gate_c6_web_reads.sql`, counted at `5eab358d` per
`packages/db/README.md:15-24`'s own "count the directory, not this line").

`PROGRESS.md:107` and the FS-11 order (`docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md:479-484`)
both say "apply `0154`…`0164`". That phrasing is correct about *what is unapplied today* (live is
148/`0153` — `packages/db/README.md:29-32`), but it is **not** what the reset tooling produces.
**No data-only reset exists anywhere in the repo** — nothing implements "keep the ledger, clear the
estate" (§12 item 3). **Plan for a 159-migration apply and a full re-derivation of every DB-owned
artifact**; two consequences follow in §1.3 and §4 step 7.

This does not disturb 裁-67 (`docs/plan/active/mohe-grill-rulings-2026-08-30.md:232-236`): `0155`'s
UNIQUE constraint still lands after the duplicates are gone — it just lands mid-chain on empty
tables instead of on top of a live 0153 catalog. The checklist's own line
(`docs/ops/wave-g-setup-checklist.md:266-269`) is satisfied either way.

**Constraint 15 is untouched by all of this** and is proven by a read, not by the script's scope
claim — step 4's second positive read.

### 1.2 `is_operator` cannot run where the stated order puts it — BELCORT does not exist after the reset

`docs/ops/g1-operator-firm-ceremony.md:93-109` requires, as a precondition, that
`select id, name from clara.firms where name = 'BELCORT'` returns **exactly one row**, and says in
terms: "If it returns zero rows, BELCORT has not been onboarded yet on this database — resolve that
first … before running this one."

After the reset there are **no** firms except the seed's synthetic pair: `0002_core_seed.sql:1-6`
creates "Two firms, four human users … three clients" under fixed synthetic ids, and no seed or
migration anywhere creates a firm named `BELCORT` (`grep -rn BELCORT packages/db/seeds/ packages/db/scripts/`
matches only `onboard-rpr.mjs`'s usage text and a comment). `onboard-rpr.mjs:295-298` refuses to
create one and states the assumption explicitly: *"On live BELCORT already exists (this is the reuse
path); firm creation is a heavier operator step (a fresh owner user + an unconsumed admission token)."*

**So BELCORT must be re-minted before `is_operator` can run** — decision **D-1**, recommended route
(a). This prep is written for (a): **`is_operator` is step 14, after the round trip (step 13)**.

### 1.3 A full re-migration ships every evaluator **DARK** — nine re-deploy acts are owed

`clara.evaluator_versions` rows are inserted `deployed = false` by construction
(`0059_wave_e_delta_metrics_behavior.sql:246` — `…,'0059_wave_e_delta_metrics_behavior',false)`;
same shape at `0091:239`, `0092:553`, `0100:613`, `0111:1530`, `0135:787`, `0140:1184`).
`frozen-evaluators.json` carries **nine** entries at `deployed: true` today —
`evaluate_fs_pack_agent_v1` · `evaluate_fs_pack_v1` · `evaluate_metric_v1` · `evaluate_metric_v2` ·
`evaluate_sst_watch` · `evaluate_sst_watches_all` · `evaluate_witness_fact_state_v1` ·
`evaluate_witness_fact_state_v2` · `evaluate_witness_identity_v1`.

After the reset every one of them is dark again, and constraint 2 (`AGENTS.md:43-46`) means any
figure that needs a deployed evaluator refuses until the ceremony re-runs. That ceremony is
`packages/db/README.md:222-241`: **act 1** `node packages/db/scripts/deploy-evaluator-version.mjs
--name <n> --version <v>`, run under the **bare** principal (no `SET ROLE` — `clara._tf_evaluator_deploy_once`,
`0060:93`, refuses unless `current_user = session_user`); **act 2** is the repo-side stamp, and here
**act 2 is already done** — the manifest already says `deployed: true` for these nine. **Do NOT run
`check-frozen-evaluators.mjs --lock-deployed`**: `packages/db/README.md:239-241` says it is BLANKET
and would stamp every currently-dark entry.

**This item is not in `docs/ops/wave-g-setup-checklist.md` at all** (§12 item 5) — and it gates the
whole product walk (§4 step 16 line 6: a report cannot render if its evaluator is dark).

---

## 2. Preconditions — every one a POSITIVE read, none assumed (law 2, `AGENTS.md:157-159`)

| # | Precondition | Instrument (what a read must SEE) | Who |
|---|---|---|---|
| P-1 | FS-10 cutover is complete, **its soak closed and recorded** (D-5), and `main` is at the intended frontier | `git -C <repo> fetch && git merge --ff-only origin/main`; `git log -1` = the sha named in the as-run | lead |
| P-2 | Manual-dispatch CI sweep on that sha is **ALL-GREEN**, closed-wave drills included | `gh workflow run ci.yml` then `gh run view <id>` job list — never a PR's colours (`docs/ops/ceremony-practices.md:52-57`; `AGENTS.md:216-230`) | lead |
| P-3 | The migration count is **counted, not remembered** | `ls packages/db/migrations/ \| wc -l` → **159**; tail = `0164_checkout_gate_c6_web_reads.sql` (measured at `5eab358d`) | lead |
| P-4 | No `UNNUMBERED_*.sql` on the branch being applied | `git ls-tree origin/main packages/db/migrations/ \| grep UNNUMBERED` → empty (`packages/db/README.md:151-163`, 裁-108) | lead |
| P-5 | The CA-pinned bridge validates against the **live** pooler today | both `openssl s_client` legs of `docs/ops/dsn-bridge.md:143-154` — WITH the CA exit 0, WITHOUT it nonzero. A review item run **before every ceremony**, not a CI gate (`dsn-bridge.md:133-141`) | lead |
| P-6 | Zero non-terminal durable runs | through the bridge: `select name, count(*) from workflow.workflow_runs where status not in ('completed','failed','cancelled') group by name;` → the C-5 prep read ZERO at 12:48 MYT 09-03; **re-read at ceremony time** | lead |
| P-7 | Supavisor session headroom for +4 (two pools × 2) | `select usename, count(*) from pg_stat_activity where usename like 'clara_%' group by 1;` — 11 at the C-5 read; the ≈27 ceiling carries a standing UNVERIFIED warning (`packages/runtime/lib/checkout-pools.mjs:59-65`) — **measure, do not quote** | lead |
| P-8 | Runtime baseline before the window | `fly status -a clara-runtime` → machine `48ee715b763048`, VERSION **71**, started, 2/2 (as-run `docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md`) | lead |
| P-9 | Canary `daba7f2e` untouched, never answered | read-only count/status; **and D-2 must be ruled — the reset DELETES its clara-side rows** | lead / owner |
| P-10 | `pg_dump` is v17 | `${PG_DUMP:-pg_dump} --version` → 17.x (`docs/ops/DR.md:127-137`; server is 17.6, `DR.md:41-43`) | lead |
| P-11 | Owner's Supabase **personal access token** available env-to-env for the Management-API receipts | `PROGRESS.md:109` names it an owner act "before the Wave-G reset"; 裁-146 point 1 (`docs/plan/active/mohe-grill-rulings-2026-09-03.md:157-160`) | **owner** |
| P-12 | The Stripe **sandbox** objects still exist and are the ones named | `prod_VBS7ZUaIFPedCs` / `price_1UB5DZHD90w0k86XNfkgYPWq` on `acct_1UAOhtHD90w0k86X`, **livemode `false`** — 裁-126 keeps the sandbox for the whole beta (`docs/plan/active/mohe-grill-rulings-2026-09-02.md:207-217`) | **owner** or lead via the Stripe connector |
| P-13 | The confirmation address is **not** a Supabase project-team address **and has no existing `auth.users` row** | `apps/web/components/entry/signup-account-form.tsx:185-194` normalizes a duplicate account to the same "check your email" state (an enumeration wall) — a reused address stalls the walk silently with no code. **`auth.users` SURVIVES the reset** (`docs/ops/DR-full-drill.md:149-151`) — see **D-3** | **owner** |
| P-14 | Custom SMTP's three unread fields verified | port / username (`resend`, the literal string) / password — `docs/ops/wave-g-setup-checklist.md:24-46` records that HOST, SENDER and SENDER NAME were read back on 09-03 and these three were **not** | **owner** |
| **P-15** | **FS-4 is CLOSED and the self-serve door is REACHABLE on the deployed build** | **At the tree:** `git log --oneline \| grep aa789d65` → *"web(FS-4 C-6, Lane B) … (#517)"*; `apps/web/app/(entry)/signup/page.tsx` exists; `/signup` ∈ `PUBLIC_PATH_PREFIXES` (`apps/web/lib/supabase/proxy.ts:62-72`). **On the deployed build:** open `https://app.clarabook.com/signup` and record what actually paints — a positive read of the deployed route's behaviour, never an assumption (FS-10 order `:459-461`). **Never read this from `PROGRESS.md`'s banner, which is stale until #538 lands.** | lead |
| **P-16** | **The destructive-authority collision is ruled (D-4)** | The owner's ruling recorded in the as-run, citing `docs/ops/DR.md:397-402` and `AGENTS.md:78-84` | owner |
| **P-17** | **The pepper and the auth-wall service token were MINTED at FS-10 and the owner holds both values** | FS-10's as-run naming them minted-once ([O]); this ceremony sets the runtime's half to the **identical** values and executes the hash comparison FS-10 had to defer (`docs/ops/wave-g-setup-checklist.md:110-133`) | **owner** |

---

## 3. The D1 write-quiesce — what the checklist says, and what actually binds

**`docs/ops/wave-g-setup-checklist.md` says NOTHING about stopping the runtime machine.** Its only
data-safety lines are the backup and the `0155` ordering (`:261-269`). That silence is not
permission — see §12 item 1.

What binds is elsewhere, and it binds **harder** here than for an ordinary migration:

1. **D1 itself.** `packages/db/README.md:165-184`: a migration that replaces an audited writer's
   body needs a write-quiesce, because PostgreSQL runs an in-flight PL/pgSQL call to completion on
   the body it *started* with. Five migrations in the previously-unapplied span replace writer
   bodies — `0154:1204,2494` · `0155:426,472` · `0157:248,346,420` · `0159:272` · `0161:359` — and
   under §1.1 the apply is the whole chain, so effectively every writer in the estate is re-created.
2. **The reset is far past D1.** `DROP SCHEMA clara CASCADE` removes the tables the live runtime is
   holding open. A running machine both (a) blocks the DROP on its locks and (b) would serve
   requests against a half-built catalog. So the machine is stopped for the **whole** reset →
   migrate → acl-baseline → seed span, not merely for a body swap.
3. **The precedent's mechanics** — `docs/ops/wave-c-c-0040-ceremony-checklist.md:19-28,37`:
   pre-quiesce Supavisor headroom read → heartbeat staleness probe (`clara.runtime_heartbeats`,
   columns `(component, beat_at)`) treated as settled only at **>90 s** → **stop machine
   `48ee715b763048`** → apply → start → `/ready` 200 all-green.
4. **Stale pooler sessions do not heal themselves.** `docs/ops/DR.md:284-291`: an ungracefully-dead
   machine leaves `idle` (not `idle in transaction`) sessions that no timeout reaps; the runbook is
   `docs/ops/runtime-hard-restart.md` §1 — LOOK, terminate exactly that set, confirm positively.
   Do this **before** the DROP, or the DROP waits on a corpse's locks.

**Ordering fact for the record:** the runtime deploy (v71) was already run on 2026-09-03 04:51Z from
merged `main` `344f7ad8`, *before* this ceremony, and it deliberately shipped with every C-5 name
absent — both C-5 routes answer **503 per request**, never at boot
(`…/scratchpad/ceremonies/runtime-deploy-v17-c5.md:58-68`; as-run
`docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md`). So FS-11 does **not** need a second
image deploy; it needs a stop, the DB work, a start, and then the secrets (each `fly secrets set`
triggers its own release).

---

## 4. The steps

Notation: **[L]** = lead, as the owner's delegate through the real audited door (constraint 14,
`AGENTS.md:78-84`, subject to **D-4**); **[O]** = owner, in the owner's own terminal/dashboard.
Every live command runs from **merged `main`, at the repo root**, and every DSN goes through the
bridge — never printed, never in argv, never in a file (`docs/ops/dsn-bridge.md:24-43`).

**The secret rule for this record (folded from the critic pass):** *every crown-jewel secret is an
**[O]** act.* `docs/ops/DR.md:397-402` puts *"reading any `~/.clara-*` / live secret"* in the
owner-run column, and that half of the classifier is **not** superseded by D-4. The lead's part is
exactly two things: the **names-and-digests receipt** (`fly secrets list` / `wrangler secret list`,
values never shown) and the **hash comparison** of the two values that must match across apps.

### The bridge preamble (used by every DB step below)

```sh
# One sleeper per PHASE, created and destroyed inside this session
# (docs/ops/ceremony-practices.md:71-113). Split argv — never one quoted "sleep 5400".
fly machine run registry.fly.io/clara-backup:<tag> --app clara-backup -- sleep 5400
# …and at that phase's close, on the record:
fly machine destroy <sleeper-id> --app clara-backup --force
```

> `clara-backup`'s scheduled machine SLEEPS between runs — the C-5 prep hit "no started VMs"
> (`…/scratchpad/ceremonies/runtime-deploy-v17-c5.md:26-30`). Either
> `fly machine start <id> -a clara-backup` (and stop it after, receipted) or use a fresh sleeper.

Every act then takes the shape:

```sh
fly ssh console -a clara-backup --machine <sleeper-id> -C "printenv DATABASE_URL" \
  | node scripts/ops/dsn-pipe.mjs -- <command>
```

`dsn-pipe.mjs` forces `sslmode=verify-full`, pins `ops/tls/pooler-ca.crt`, scrubs inherited
`PG*`/`NODE_OPTIONS`, and sets `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` in the **child's env
only** — so `psql -v ON_ERROR_STOP=1 -f file.sql` needs **no connection argument at all**. Never
`psql "$DATABASE_URL" …` (that puts the DSN in `psql`'s own argv, visible to `ps`) —
`docs/ops/dsn-bridge.md:35-43,58-67`.

---

**Step 1 · [L] Learn the exact destructive-target string without printing a secret.**

`reset`/`seed` refuse a non-ephemeral target unless `CLARA_DESTRUCTIVE_TARGET` equals
`user@host:port/db` exactly (`packages/db/lib/guard.mjs:76-90`). Get that string from the guard
itself — run the reset **without** the variable and read its refusal:

```sh
… | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/reset.mjs
```

*Positive read:* the refusal names the exact identity to set. It carries the pooler **username**
(which is what identifies the project on a shared pooler — `guard.mjs:14-22`) and **no password**
(`packages/db/lib/pg.mjs:170-178` builds it from `resolveTarget`, which returns "the USER (never a
password)", `pg.mjs:44-46`).

---

**Step 2 · [L] BANK THE BACKUP — and PROVE IT RESTORES, by restoring THIS bundle into a throwaway.**

`docs/ops/wave-g-setup-checklist.md:263-265` makes this a gate: *"A **full DB backup runs before the
factory reset** … Confirm the backup completed **and is restorable** before the reset proceeds."*
Only the FULL profile is a recovery artifact — the default profile is diagnostic and restoring it
is a privilege-escalation (`docs/ops/DR.md:104-122`; `packages/db/scripts/backup.mjs:1-23`).

**2a — take it.**

```sh
export PG_DUMP=/path/to/pg17/bin/pg_dump      # only if PATH pg_dump < 17 (DR.md:127-137)
fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" \
  | node scripts/ops/dsn-pipe.mjs -- node packages/db/scripts/backup.mjs --profile full
```

*Positive reads:* the printed output path + byte size under `packages/db/backups/` (gitignored);
`head -1` of the dump showing `Dumped by pg_dump version 17.x`; the four authoritative schemas named
in the run (`clara`, `workflow`, `workflow_drizzle`, `graphile_worker`). **Copy it off-site** — "the
project itself is not a backup of itself" (`DR.md:148`). Also record the newest R2 bundle's
timestamp (the daily `clara-backup` run, `DR.md:359-371`) as the second, off-vendor copy.

**2b — RESTORE IT. This is the gate, and it is committed to the monthly-light shape**
(`docs/ops/DR.md:431-436`), because pass 1's three options were all evasions: two were *past* drills
and the third (`db:dr:selftest`) exercises the **default** profile only (`DR.md:186-192`) — none of
them restores *this* bundle.

```sh
# A LOCAL THROWAWAY PG17 — scratchpad pg17 bins, port 55432 (DR.md:432-433).
# This is the lane DR.md:401 explicitly grants the agent: "validates only on a throwaway PG17".
psql -h 127.0.0.1 -p 55432 -U postgres -v ON_ERROR_STOP=1 -f packages/db/deploy/roles-bootstrap.sql
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_DESTRUCTIVE_TARGET="postgres@127.0.0.1:55432/postgres" \
  pnpm db:restore:full   # the bundle from 2a
CLARA_DR_SOURCE_URL=<live, READ-ONLY> CLARA_DR_TARGET_URL=<the throwaway> \
  pnpm db:dr:verify      # the subset: schema presence + the manifest floor + the AP gate
```

*Positive reads, all four:* `roles-bootstrap.sql` recreates the clara-custom roles (**19 at
`265a8ee7` — count the file, not this line**, `packages/db/README.md:75`); `restore:full` completes;
`dr-verify`'s schema-presence, manifest-floor and AP-gate checks PASS; and the throwaway is dropped
afterwards, receipted.

*Two honest scope notes, recorded rather than skipped:*
- **The §10 re-render leg has no subject.** `DR.md:434` adds "re-render the most recent sealed
  `pre_sign` artifact and compare sha256" to the monthly-light bar. On this project
  `clara.report_artifacts` is **empty** (裁-136, `docs/ops/wave-g-setup-checklist.md:240-241`), so
  that leg is **N/A by measurement, not by omission** — record
  `select count(*) from clara.report_artifacts;` → **0** as the proof. (This is also the pre-read
  that step 15.4 turns into a one-shot fact.)
- **The R2-sourced copy needs the owner.** Decrypting an R2 bundle needs the **age identity**, which
  is **owner custody, off-repo AND off-R2** (`DR.md:376-381`). If the owner wants the *off-site*
  copy proven rather than the local one, 2b becomes an **[O]** act.

---

**Step 3 · [L] Quiesce.** Per §3: read Supavisor headroom and the heartbeat staleness probe →
`fly machine stop 48ee715b763048 -a clara-runtime` → wait for beats stale **>90 s** → LOOK at
`pg_stat_activity` for `clara_%` sessions and, if the machine died rather than stopped cleanly,
terminate exactly that set per `docs/ops/runtime-hard-restart.md` §1.

*Positive read:* `fly status -a clara-runtime` shows the machine **stopped**; `select count(*) from
pg_stat_activity where usename like 'clara_%' and state <> 'idle'` → **0**; heartbeat age > 90 s.
Record all three verbatim (a zero read is the evidence; absence of a look is not — law 2).

---

**Step 4 · [L, per D-4] RESET — `DROP SCHEMA clara CASCADE`, scoped.**

```sh
fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" \
