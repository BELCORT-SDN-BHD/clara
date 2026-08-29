# Clara 磨合 alignment audit — 2026-08-29

**Ground truth:** `origin/main` HEAD `7e9180df` (PR #418, merged 2026-08-29 09:18Z — one commit past
the `4183f5e9` the census lanes opened against). Migrations `0001..0147`, **142 applied live**
(`docs/plan/completed/mohe-0147-apply-asrun.md`). Read-only pass: no docker, no rig, no live DB.
~100 named agent lanes were active concurrently — this is a **snapshot at read time**, not a settled
state.

**Method.** Four census lenses (backend doors ↔ frontend calls · user flows · agentic vision ·
design system + provided resources) plus a backend residual sweep. Every candidate gap was then put
through **two independent adversarial verification passes** whose only job was to refute it — by
showing it is built, its premise is false, or it is already tracked with a named next step. **28
candidate gaps were refuted. 15 survived.** Section 3 lists every refutation so the owner can see
what was checked and dropped, not only what stuck.

---

## 大白话摘要（给业主）

1. 前后端基本对齐了：`apps/web` 现在调用约 **206 个后端门**（一天前只有 85 个），11 条 port wave 全部落地。
2. 08-28 普查列的 29 个「孤儿门」，21 个已接上；剩下 **6 个**全是您批过「不接」或已排到 P4 的（原报 8 个，我实测其中 2 个其实早就接好了）。
3. **没有一个真正「卡住 beta」的缺口** —— 唯一一个被提名的，经两轮独立复核后降级。这是本次审计最重要的结论。
4. 但有 **8 项 must-before-beta**，其中 **3 项必须您裁决**，工程这边无法代劳。
5. 最急、也最不能靠加班赶出来的：**Wave G 的验收证据**（BEE 两个财年的总账+试算表、RPR 二月三月的银行月结单或一纸「确实没有」、RS/RPR 的编制人与审核人姓名）。这些只有您能去要，外部有周转时间，而**今天的裁决清单里根本没有它**。
6. 第二件要您裁的：**F-T3 报税计算没有验收标准（OQ-1）**。不裁，默认就落到「不设金标准」那一档 —— 等于税表底数算错了也没有任何一道墙会响。
7. 第三件：**裁-18b**（授权 Clara 无人复核直接过某供应商发票）**跳过了别的设计集都走过的独立对抗性评审**。要么补跑，要么白纸黑字裁定「业主问答即为该评审」。
8. **新发现、之前没人报过**：现在跑的 `chatTurn_v14` 会往对话里推 4 种卡片（银行动作、银行数据包、已过账分录、已开问题），但**两个前端都不认识它们**，会渲染成「不支持的卡片」警告条 —— 恰好打在「界面就是 Clara 的肢体语言」这句话上。
9. 设计系统纪律很好：零个裸色号、零个 `dark:`、三道无障碍 CI 闸门都在跑。缺的是把您 **08-27 已经裁过的两条**（颜色 lint 禁令、Mobbin MCP 入库）真的执行掉 —— 裁了两天，都还没落地。
10. 另有三份文件（`apps/web/README.md`、`docs/design/` 两个骨架）现在写着**与事实相反**的话，会把下一个读它的人（包括下一个 AI lane）带偏，顺手改掉即可。

---

## 1 · Verdict on the four alignment questions

### 1.1 Frontend ↔ backend doors — **ALIGNED, with one named unbuilt tranche**

| Metric | 08-28 census | This pass (08-29) |
|---|---|---|
| Distinct `callDoor` verbs called by `apps/web` | 60 | **165 literal + 2 dynamic** (`ar_aging`/`ap_aging`, `apps/web/lib/registers/aging.ts:64-65`) = **167** |
| Distinct `getRows` relations called | 25 | **39** |
| Total distinct backend-surface names | 85 | **≈206** |

The growth is the port wave (T0–T11, 11/11 on main, `PROGRESS.md:11`) landing in one day — the same
~250-item catalog getting its frontend home, not new backend surface.

**Against the 08-28 census's own three buckets, re-tested at today's call sites:**

- **29 orphans → 21 wired, 6 residual.** The census's residual list of 8 is **wrong by 2**: I read
  `request_autodraft` at `apps/web/lib/documents/doors.ts:140` with a real UI call site at
  `apps/web/components/documents/document-filings-history.tsx:82`, and `request_reextraction` at
  `doors.ts:164` with its call site at `apps/web/components/documents/document-admin.tsx:141`. Both
  shipped in T6 (#386). The true residual is **6**, and every one carries a written disposition:
  `create_firm` · `users_visible` · `set_firm_high_stakes_threshold` routed to P4
  (`docs/plan/active/port-wave-plan-2026-08-28.md:81`); `verify_snapshot` · `get_journal_entry` ·
  `record_notification` owner-excepted (`:82`). `create_account_set_v1` additionally carries an
  honest in-code NotBuiltNote naming itself (`apps/web/lib/reports/types.ts:193-200`) and was ruled
  RETIRE (裁-12).
- **81 cutover-owed → every named item wired**, sampled exhaustively across all 7 domain clusters.
- **~79 deliberately-non-UI** — not re-audited; a citation-backed ruling, not a wiring question.

**New doors minted after the census (0141 / 0145) — 8 write-doors + 1 view, all unwired.** These are
exactly the three-tier firm-creation/staff-invite surface `PROGRESS.md:132-134` names as still owed;
P4's design of record is merged (#376) and its DB half is live (0141, 0145), the **web build has not
started** (`origin/web/p4-design` is design-only). Tracked, not silent. One residual worth its own
row: `clara.counterparty_aliases_visible` (`0145:960-964`) is **live, granted, and read by nothing**
— `grep -rn "counterparty_aliases_visible" apps/web/` returns zero hits, confirmed this session.

**Direction 1's denominator (247 EXECUTE-granted fns + 3 masked views) was NOT independently
reproduced** — the 08-28 figure came from a live `pg_proc`/grant read on a throwaway rig, and this
session has no rig. Only the WIRED side is measured here.

### 1.2 User flows — **the onboarding → close → reporting arc is walkable; the "tax" leg of the lifecycle has neither half**

24 of 27 audited journeys are built. Everything the PRD's ongoing-close loop needs exists as a real
surface: sign-in, invite-accept, needs-you inbox, activity feed, client register, in-thread
onboarding, opening balances, documents/OCR/coding, journals (incl. manual compose), bank ingest and
matching, counterparties + AR/AP aging, COA, fixed assets, adjustments, staff advances, the
three-key close, statutory reports, knowledge wiki, and the client/firm chat rails.

**Three journeys have zero frontend, and the reason is the same in all three: there is no granted
backend to surface.** Building a page over them would be a fake control, which `apps/web/AGENTS.md`
forbids outright.

| Journey | Backend state | Frontend design state |
|---|---|---|
| Tax computation (F-T3) | greenfield, PR-0 gate pending | **no page, no tab, no ⌘K entry, no typed part — and none designed** |
| SST engine (F-T1) | PR-1 built, **unmerged**, no D1 owed | **none designed** |
| Payroll statutory calendar (F-T2) | `0139` DDL live, owner-only, **no grant, no verb** | one page designed — targeting the **retiring `apps/dashboard`** |

Note the asymmetry with everything else in the estate: `grep` across the five `sst-engine-*.md` and
five `tax-computation-*.md` design files returns **zero** `apps/web` hits. Every other lane names its
frontend home. This is an **IA decision owed before three lanes each invent their own answer**, not a
build gap — filed at polish, since there is nothing to wire.

Billing/subscriptions is explicitly deferred pre-launch by the PRD itself (`docs/product/PRD.md:205`)
— not a broken promise. Firm-admin members/capabilities/metering is the P4 UI tranche above.

The one real user-flow defect is the ⌘K manifest (§2, MBB-5).

### 1.3 The agentic vision — **the mechanism is right; the live emitter has outrun both renderers**

| Surface | Measured |
|---|---|
| `ClaraPart` wire union | **18 live members**, tsc-enforced exhaustive (`apps/web/lib/parts/types.ts:102-120`, `catalog.ts:142-145` `AllCovered`/`NoExtra`) |
| Render richness | 5 rich (`text`/`attachment`/`clarify`/`clarify_closed`/`refusal`), 10 id-only `PartSummaryCard`, 2 status-resolvers render nothing by design, unknown → **visible warning chip, never dropped** (`PartRenderer.tsx:160-172`) |
| needs-you `row_kind` | **9 live**, exhaustive `Record<ReviewQueueRowKind,…>`: 7 carry a real inline act, 2 link-only by design (`needs-you-affordances.tsx:80-112`) |
| law-71 human-only gating | Every sampled sign/settle door (close begin/finalize/abandon/reopen, `settle_close_proposal`, FA depreciation authority, adjustment-template sign, vendor-identity binding) is fronted by a dedicated `*-ceremony`/`*Dialog` showing rationale + model before the door fires |
| Agent vs human labeling | Distinct and never conflated — agent acts carry model name/version + `via_wake_kind` + verdict; human settles carry `settled_by` + `settle_reason` |

The widely-suspected gap — "9 of 10 receipt part kinds are never emitted" — **was refuted twice**:
they are forward-declared by design with the reason written at the declaration site
(`apps/dashboard/app/shared/parts.ts:85,100,118` — constraint 9 forbids editing a frozen `chatTurn`
body, so a new kind must wait for a `_vN`), they are ruled into P6's `chatTurn_v15` bump (裁-20), and
three of them (`doc_review`, `diff`, `open_question`) already render live from needs-you rows via
`apps/dashboard/app/shared/queueKindCatalog.ts:199-208`.

**But the refutation surfaced the converse defect, which nobody had filed — see MBB-4.** The live
registry is `chatTurn: chatTurn_v14` (`packages/runtime/workflows/registry.ts:54`).
`ClaraPartV14 = ClaraPart | EntryPostedPart | QuestionOpenedPart | BankActPart | BankPackPart`
(`chatTurn.v14.prompt.ts:26`), and `toTypedParts_v14` pushes them onto the wire at `:92`/`:94`.
Neither frontend union knows any of the four — `grep` over `apps/web/lib/parts/types.ts` +
`catalog.ts` returns **no hits** (exit 1); the same grep over `apps/dashboard/app/shared/parts.ts`
returns **0**. The four kinds queued for the planned P6 bump (`agent_receipt`, `firm_question`,
`close_proposal`, `freeform_result`) **are a different four** — the plan does not cover this.

### 1.4 Design system + provided resources — **unusually high discipline; two owner rulings sat unexecuted for two days**

**What is enforced and clean, measured this session:** tokens ported with cited provenance
(`apps/web/app/globals.css`, 433 lines, citing `clarabook-frontend g5-design-system@a86e48a` and
`docs/01-TOKEN-CONTRACT.md` by section, with drift notes inline) · `components.json` on
`base-nova`, `cssVariables: true` · 12 vendored shadcn primitives · 18-member card catalog with a
compile-time guard · **three a11y CI gates all wired** into `pnpm lint`/`pnpm test`
(`check-token-contrast.mjs` · `a11yRules.ts` · `keyboardWalk.ts`) · motion tokens with 4
`prefers-reduced-motion` blocks, each utility carrying its own arm · **zero** raw hex, **zero**
Tailwind default-palette classes, **zero** `dark:`, **zero** inline `style={{`, **zero**
`.module.css` — reproduced independently, twice.

**What is absent:**

| Item | State | Ruling |
|---|---|---|
| Raw-hex / palette lint rule | **absent** — `eslint.config.mjs:106-117`'s only apps/web rule bans 3-arg `window.open`, read in full this session | **Q4, 2026-08-27: "raw color values in page components are lint-banned"** — unexecuted |
| Mobbin MCP in `.mcp.json` | **absent** — read this session: only `codebase-memory-mcp` + `shadcn@4.12.0` | **R5, 2026-08-27: add it, rides the next code PR** — ~20 code PRs later, unexecuted |
| WCAG 2.2 SC 2.5.8 target-size gate | absent | 裁-13 — **ruled ADOPT AT P6**, scheduled |
| Clara mascot asset | absent — `find apps/web/public -type f` returns 5 font files only | 裁-14 — **ruled IN at P6**, scheduled |

Stack is current and consistent with the ratified choices: `next 16.3.3` · `react 19.2.8` ·
`tailwindcss 4.3.3` · `shadcn 4.19.0` · `@base-ui/react 1.7.0` · `@opennextjs/cloudflare 1.20.3` ·
`tw-animate-css 1.4.0` — no framer-motion, no gsap (CSS-first, consistent with the Emil discipline
the audit found consumed).

---

## 2 · Surviving gaps, ranked

### BLOCKING-BETA — **none**

One candidate was nominated (the ⌘K `/inbox` 404, on the strength of ⌘K being the PRD's documented
universal entry). Both verification passes confirmed every fact and **one corrected the severity
down**, on a mitigation the original finding missed: `apps/web/components/firm-nav.tsx:11` carries a
correct, always-visible `/needs-you` link mounted in the persistent sidebar
(`app/(firm)/layout.tsx:50`), so the inbox is never unreachable. Recorded here as a dissent, not
suppressed — one lens still argues the aggregate (a 404 plus nine false "Not built yet" badges on
the surface most likely to be exercised in a demo) is beta-blocking.

### MUST-BEFORE-BETA (8)

---

**MBB-1 · Wave G's acceptance oracle has open owner-evidence gaps with no date, and is absent from
today's owner batch** — ⚠️ **OWNER RULING NEEDED** · **highest latency in the whole queue**

- **Evidence.** `PROGRESS.md:154-157` (Next §5): "*Still open for the owner … the corpus's
  oracle-tier gaps (BEE GL/TB both FYs + full FY2025 doc · RPR Feb/Mar-2025 statements or a written
  none-exist · named producer/certifier for RS+RPR · the authoritative RPR series)*". Two independent
  documents state the run is hard-blocked: `docs/plan/active/wave-g-corpus-oracle-assessment.md:32`
  ("*the run cannot start on an oracle without them*") and
  `docs/plan/active/wave-g-e2e-corpus-design.md:495-499` ("*The run cannot start until the gaps
  close.*"). `docs/adr/0072…:223-228` files them under "*Not reached (honest boundary — open for
  their own sittings)*". `docs/plan/active/mohe-owner-batch-2026-08-29.md` was read **in full**: the
  gaps appear in **none** of its eight items. Neither Wave-G doc has been touched in five days.
  Flagged as orphaned once already, six days ago, at `docs/plan/active/harness-audit-2026-08-23.md:115-120`.
- **Why it is first.** Wave G is the last gate before beta live. Every other must-before-beta item is
  agent-buildable; this one is not. BEE's GL/TB sit with two *different* prior firms (ROME PUBLIC
  ADVISORY FY2024, LUXE WEALTH CONSULTANCY FY2025); RPR's missing months need a bank retrieval; the
  RS/RPR producer/certifier names must be obtained from whoever produced papers whose only producer
  marker today is the login "ADMIN". **Zero engineering path, non-zero external turnaround.**
- **Fix.** A row in the next `mohe-owner-batch-*.md` with a named delivery date. One sub-item is cheap
  and can be split off today: the **authoritative RPR series pick** (`wave-g-corpus-oracle-assessment.md:102-105`)
  is a choice between two series already in hand, not a document to source — and without it "*the bank
  reconciliation sees every April–July transaction twice*".
- **Lane.** Owner, via the conductor's next batch. No build lane can absorb it.

---

**MBB-2 · F-T3's acceptance oracle (OQ-1) is unruled, off every agenda, and its unruled default
fails OPEN** — ⚠️ **OWNER RULING NEEDED**

- **Evidence.** `docs/plan/active/tax-computation-gate-record.md:286-292`: "*No Form C, no tax
  computation, no CP204 and no fixed-asset register in the corpus … every cell in the battery can
  pass while the bottom line is wrong, and GB-1 and GB-2 are both exactly that*" — i.e. **two of the
  gate's own eleven blockers were green-while-wrong**. The 15-cell battery is a REFUSAL/wall battery
  (`tax-computation-annexes-2-mechanics.md:341-384`), not an oracle. Four owner sittings have been
  held since the card was raised (08-26, 08-27, 08-27-evening, 08-29 morning) and **none took it**;
  the catch-all backlog row `PROGRESS.md:191` enumerates "*F-T3 OQ-2/3/9*" and **omits OQ-1/7/8**.
  Its only agenda home is six days stale (`wave-f-sprint-handoff-2026-08-23.md:83`).
- **Why it matters, sharply.** Every other pre-beta gate in this estate defaults to a refusal. OQ-1's
  card (`tax-computation-annexes.md:339-344`) offers (a) one hand-worked YA as a golden bar — "*a few
  hours, once — the only thing that catches a whole-ladder error*" — or (b) battery-only, "*the ladder
  error stays possible until Wave G*". **Unasked, it resolves to (b) by inaction.** Hard constraint 2
  guarantees the number is deterministically reproduced from DB-owned inputs; it does not guarantee
  the number is right, and the human backstop reviews against nothing.
- **The must-before-beta act is the RULING, not the build.** The schedule says the build is not
  credibly landable pre-beta anyway (`wave-f-sprint-dag.md:399` books F-T3 at +260h; PR-0 has not
  run; its D1 window is "*a future window — Track B is outside the current W1-W5 inventory*").
  **Shipping F-T3 with no oracle is worse than not shipping it.** Option (a) is owner labour with
  lead time — pick a company with a disposal so capital allowances are exercised.
- **Also true-up in passing:** `wave-f-contract.md:426` still reads "*F-T3 (last; may slip v1.1)*",
  which `PRD.md:226` explicitly superseded. Product law wins, but that stale line is exactly what a
  future lane would cite to justify slipping the item.
- **Lane.** Owner batch (rule OQ-1 + re-confirm the ALL-IN ruling against the schedule); conductor
  trues the contract line.

---

**MBB-3 · 裁-18b was build-authorized on owner Q&A alone, without the independent adversarial design
gate every other design set ran** — ⚠️ **OWNER RULING NEEDED**

- **Scope corrected.** Both verification passes agree the finding must be **narrowed to 裁-18b
  alone**. 裁-21 (COA) is off the list: `coa-template-annexes.md:341` defines **PR-0 as the gate
  itself** with seven replay obligations "*before authoring*", `:343-344` requires an independent
  pass on PR-b and law-28's cross-model adversarial pass as **MANDATORY** on PR-c, and
  `PROGRESS.md:129` tracks "*裁-21's research lane before PR-0*". 裁-19 is also off: its gate record
  correctly *states* the requirement ("*the independent judgement-logic review has not run and the
  build may not start*").
- **Evidence for 裁-18b.** `binding-proposal-gate-record.md` — a full-file grep for "review" returns
  **ZERO hits**; the header reads "*the gating three (G1/G2/G4) are ruled, so the first DB PR may
  open*", and the ruled sequence (PR-1..PR-4) **has no PR-0**. Contrast **14 sibling design sets**
  whose PR-0 gate records each open by naming independent lenses + per-finding adversarial
  verification (f-a2, bank-agency, close-key-1, filing-and-interview, reporting-agency, freeform-read
  ×2, internet-lane, metering, sandbox-export, sst-engine, tax-computation, payroll-calendar,
  fix-queue).
- **Sharpest point.** 裁-18(b)'s **own ruling text** ordered "*its own design gate + backend +
  frontend train*" (`binding-proposal-survey.md:4-7`). Everywhere else in this estate "its own design
  gate" produced a PR-0 lens review; here it produced an owner sitting. And ADR-0028 / digest law 82
  makes cross-model adversarial review practice "*for the DESIGN of anything touching the approval
  path*" — 裁-18b is that path by its own words (`binding-proposal-design.md:63`: the binding is
  "*the human-signed authority that lets Clara auto-post a vendor's invoices without a human eye*"),
  and 裁-25 pulled `_approve_entry_core` replacement *inside* the item. A grep across all four
  binding-proposal docs for `law 28|cross-model|adversarial|independent review` returns **one hit**,
  an unrelated grant-census cell.
- **Countervailing, stated honestly.** No law is breached: AGENTS.md review law 1 binds *before
  merge*, and both merge-stage passes are on the books (`binding-proposal-design.md:16`). What was
  skipped is the earlier, cheaper catch. But the empirical yield of the 14 sibling gates was high and
  shape-changing (3–6 blockers each; sst-engine refuted 8 premises, tax-computation 9). Also note
  F-A7b is a **prior precedent** for the same pattern (`fa7b-gate-record.md:1-8` is an owner-sitting
  record only) — so the tally is 14 of 16, which strengthens "an unrecorded process narrowing already
  in progress" over "an inconsistency nobody decided".
- **Fix — one of two owner acts, not a build.** Either (i) run the design gate (a lens list + an
  independent verifier who did not author, plus law-28's cross-model pass), or (ii) record a ruling
  narrowing 裁-18(b)'s "its own design gate" to the owner Q&A, making F-A7b/裁-18b a deliberate,
  precedented narrowing. **The window is closing now** — `refs/heads/feat/vendor-binding-build`
  exists and PR-1 is being authored.

---

**MBB-4 · [NEW — not previously filed] The live `chatTurn_v14` emits four part kinds that neither
frontend can render**

- **Evidence, all read this session.** Registry: `packages/runtime/workflows/registry.ts:54` →
  `chatTurn: chatTurn_v14`. Union: `chatTurn.v14.prompt.ts:26` →
  `ClaraPartV14 = ClaraPart | EntryPostedPart | QuestionOpenedPart | BankActPart | BankPackPart`.
  Emission: `toTypedParts_v14` at `:92` `out.push(output.admitted)` (a `bank_act`) and `:94`
  `out.push(output.pack)` (a `bank_pack`); `entry_posted` constructed at `chatTurn.v13.post.ts:221`,
  `question_opened` at `:405`. Renderers: `grep "entry_posted\|question_opened\|bank_act\|bank_pack"`
  over `apps/web/lib/parts/types.ts` + `catalog.ts` → **no hits (exit 1)**; the same grep over
  `apps/dashboard/app/shared/parts.ts` → **count 0**.
- **What the user sees.** `apps/web/components/parts/PartRenderer.tsx:160-172` — a warning
  `<Badge>` reading "Unsupported part: bank_act". Fail-closed and visible (correct behaviour, and
  the guard working exactly as its comment says it should for "*a future server*"), but it means
  **every agent bank act and every chat-posted entry renders as an error chip instead of a receipt**
  — on the one surface the whole "dashboard is the agent's body language" thesis rests on.
- **Not covered by the plan.** The P6 four-part bump is `agent_receipt` / `firm_question` /
  `close_proposal` / `freeform_result` (`apps/web/lib/parts/types.ts:7-10`;
  `port-wave-plan-2026-08-28.md:494-498`) — a **different four**. Nothing schedules these.
- **Fix.** Add the four kinds to `apps/web/lib/parts/types.ts` + `catalog.ts` with render branches,
  and fold them into P6's bump so it lands **eight**, not four. Cheap: purely additive on the
  frontend, no runtime version bump required (the emitter already ships them).
- **Lane.** P6 wire-bump lane (or a small standalone apps/web PR — it is additive and independently
  testable). Verify against a live thread first; see §5.
- **No owner ruling needed.**

---

**MBB-5 · The ⌘K route manifest is stale in both directions: one hard 404 on the flagship inbox, and
nine live surfaces badged "Not built yet"**

*(Merges the two separately-filed findings — same file, same commit, one fix.)*

- **Evidence, read verbatim this session from `apps/web/lib/command/routes.ts`.** `needsYou` →
  `href: "/inbox"`, `status: "planned"` (:69-74) while the real page is
  `app/(firm)/needs-you/page.tsx`; `grep -rn "/inbox" apps/web` returns **only routes.ts**;
  `next.config.ts` has no `redirects()`/`rewrites()` (deliberately, per its own comment), `proxy.ts`
  has only the `/login` bounce, and there is **no `not-found.tsx`** — so the landing is Next's bare
  404, rendered *outside* the `(firm)` shell. `status: "planned"` paints a badge but does **not**
  block select: `command-palette.tsx:134` `onSelect={() => goTo(route.href)}` → `:110-113`
  `router.push(href)`. Separately, `clientRegister` `/clients` (:79), `firmActivity` `/activity`
  (:86) and **all seven** client tabs (journals :138, documents :145, bank :152, close :159, reports
  :166, registers :173, knowledge :180) still read `status: "planned"` while every one has a real
  `page.tsx` rendering a real workbench. `messages/en.json:203` resolves that badge to the literal
  string **"Not built yet"**.
- **Why it matters.** ⌘K is `PRD.md:143`'s "*One way in, from anywhere*", mounted on every firm page
  (`app/(firm)/layout.tsx:35`). Ten of fifteen Go rows are wrong. It is the exact inverse of the
  file's own corollary at `routes.ts:29-32` ("no affordance may look live when it is not"): here the
  entire shipped product looks dead.
- **It breaks a standing wave law, and the assigned gate cannot see the worst case.**
  `port-wave-plan-2026-08-28.md:181-183` makes truing `routes.ts` "*part of a train's own merge,
  never a later sweep*" — a law 16 merged PRs then ignored (`git log` on the file returns exactly two
  commits: `661e9448` P2, `fccaf7d3` T10, which trued only its own `/admin` rows). The designated
  backstop, `-part2.md:206-208` §9.2, specifies the control as "*every `status` checked against
  whether a `page.tsx` exists at that path*" — **the `/inbox` row PASSES that control** (status is
  "planned" and no page.tsx exists at `/inbox`). Status-to-tree, never href-to-intent.
- **Not tracked.** `PROGRESS.md` grepped for `/inbox`, `routes.ts`, `cmdk`, `command palette`,
  `needsYou` — zero hits. No test references `FIRM_ROUTES`/`CLIENT_ROUTES`; `apps/web/test/manifest.txt`
  has no routes entry.
- **Fix (one commit, no blast radius).** `needsYou.href` → `/needs-you`; flip all ten rows to
  `"built"`; **then close the class**: add a test that derives every href from the live `app/` tree,
  asserting BOTH that a `"built"` path has a `page.tsx` AND that every listed href resolves — since
  §9.2's status-only check passed this file unchanged. Precedent in-repo:
  `scripts/check-test-manifest.mjs` already globs real files and reds the build.
- **Lane.** apps/web, rides P6's entry conformance pass or any small PR. **Mitigation meanwhile:**
  `firm-nav.tsx:11` + `client-workspace-nav.tsx:33-40` reach every surface correctly.
- **No owner ruling needed.**

---

**MBB-6 · ⌘K "Do" tells every user it "wires up in P3" — a milestone that shipped two days ago
without it**

- **Evidence.** `apps/web/messages/en.json:230` → `"disabledLabel": "Dispatch a run — wires up in
  P3"`, read this session. P3 completed 2026-08-27 (#364/#367, `PROGRESS.md:112`) and shipped nothing
  here. The row is live on every firm page (`command-palette.tsx:183-190`, a disabled `CommandItem`).
- **Why this is not merely cosmetic.** `apps/web/AGENTS.md` names this exact row as its own honesty
  precedent — "*A missing backend verb renders honestly 'not built yet' (the ⌘K 'Do' precedent)*".
  **The precedent-setter is now the violator.** `en.json` is not a frozen file (`git log -1` →
  `b2b0eca5`, #412), so the false claim survived every intervening edit unnoticed. It is one of a
  family: `en.json:33,37,106,123,153,464,948,1044` all still read "built in P3".
- **Fix.** One line: retitle to an undated honest form. (The *feature* is a separate, lower item —
  see P-1.)
- **Lane.** apps/web, any PR. **No owner ruling needed.**

---

**MBB-7 · Two backlog defects need an owner and a test: the identifier-promotion duplicate-open wall,
and the spreading `trigger_id` looseness**

Both were filed as record-only. Both verification passes independently argued for upgrading them,
for different and specific reasons.

- **(a) `wake_propose_identifier_promotion` has no duplicate-open wall — and the whole chain is
  unwalled.** `0103_f_a7_pi_additive.sql:830-831` is a **plain** `create index … where status =
  'proposed'`, not unique; `_identifier_promotion_core` (`:833-864`) inserts unconditionally with no
  existence probe. `0143` explicitly pins that body as untouchable and re-asserts it by prosrc sha.
  **Worse than the record says:** `confirm_identifier_promotion` derives its inner op_key from the
  *outer* one (so two confirms under two op_keys mint two reservations), `add_client_identifier`
  (`0007:1508-1529`) has no existence check, and `clara.client_identifiers` has **no unique
  constraint** — deliberately (`0007:235`). So two duplicate open cards confirm to **two identical
  durable rows in the identity table attribution matches on**. The record's own mitigating clause —
  "*Door 2 and 裁-18b carry a partial unique*" — is **false as to Door 2**: Door 2's wall is a plain
  body check (`0142:456-461`), not an index, so both doors are race-open. **No test:** every existing
  cell covers op-key replay (same key), never duplicate content under a fresh key.
  **Fix:** `create unique index … where status='proposed'` on `(firm_id, client_id, kind,
  value_normalized)` + the `unique_violation`→typed-refusal map the sibling door already has
  (`0028:770-772`), plus one RED cell. Cheap: no D1 window, no body change — the same shape 裁-18b's
  W7 already ships for the vendor table.
- **(b) `trigger_id` carries the credential uuid where the contract says the task/turn — and it is
  scheduled to spread.** Contract: `0103:274` ordinal 16, "*the triggering task or turn*", with
  `trigger_kind` mechanically bound. Writers pass `'wake_task', w.credential_id::text` at
  `0126:1580`, `0126:1922`, and — the newest — `0142:491`. The column check is `btrim(…) <> ''`, which
  a uuid passes, so nothing can notice. **The escalation:** `binding-proposal-design.md:313-315`
  states 裁-18b will propagate it into a **ninth** receipt table by explicit design decision ("*this
  item does not invent a fix, it inherits the backlog item verbatim*"). A defect whose fix cost is
  **scheduled to grow** is not record-only. Only test hit repo-wide is a `null::text as trigger_id`
  view-shape fixture. **Fix:** mint the honest `wake_credential` trigger_kind the record itself names,
  **before the ninth member lands**.
- **Lane.** (a) a small standalone migration; (b) fold into 裁-18b PR-1 or precede it.
- **No owner ruling needed** — but both should get a PROGRESS row with an owner, which is what they
  lack today (the sibling entries in the same block each carry one; these two have an empty owner
  column).

---

**MBB-8 · The owner's 08-27 ruling that raw colour values are "lint-banned" has not been
implemented — nothing mechanically stops a regression**

- **Evidence.** `docs/plan/active/mohe-grill-rulings-2026-08-27.md:41-42` (Q4, the ruling that
  ratifies the ClaraBook brand system): "*The token map, shadcn/Base-UI-first rule and the motion
  discipline … port into apps/web wholesale; **raw color values in page components are
  lint-banned***." Two days later: `eslint.config.mjs` read in full — the **only** apps/web-scoped
  rule (`:106-117`) targets 3-arg `window.open`. No stylelint, no `eslint-plugin-tailwindcss`, no
  `--color-*: initial` wipe in `globals.css` (so the full default palette and arbitrary `bg-[#f00]`
  still compile — the gap is total, with no build-time backstop). `check-token-contrast.mjs` reads
  **only** `globals.css` (`:337-342`, `:353`) — it checks the tokens' contrast maths, never whether
  component code stays inside the token vocabulary; its own header concedes the pair census is
  manual and prose-fenced.
- **Both verification passes corrected the severity to *should-before-beta*, and both argued the
  deadline is earlier than beta:** the value of the gate is not cleaning today's tree (verified clean,
  twice) but holding it clean **through P6 tier-(c)**, the one wave that re-touches every colour on
  every surface across multiple delegated polish lanes. **Bind it to P6's entry gate**
  (`mohe-grill-rulings-2026-08-28.md:115`, 裁-9's third conformance pass), not to beta.
- **Second-order:** because the contrast gate is a closed-world token-pair check, a raw hex in a
  component escapes not only the brand contract but **the WCAG 2.1 AA contrast gate entirely** (Q7).
- **Fix.** Two added selectors inside the *already-existing* apps/web block at `eslint.config.mjs:106-117`
  — a hex regex on className/style literals, and a default-palette class-shape regex — plus a
  mechanical re-census for `PAIR_SPECS`. Rides any next apps/web PR; no pipeline edit.
- **Likely second instance of the same pattern, flagged not filed:** the sibling clause on
  `mohe-grill-rulings-2026-08-27.md:48` ("hardcoded UI strings are lint-banned") is still described in
  the future tense at `apps/web/i18n/request.ts:8` and `README.md:76`.
- **Lane.** apps/web. **No owner ruling needed** — it *is* an owner ruling awaiting execution.

---

### POLISH (5)

**P-1 · ⌘K "Do" has never dispatched anything, and its remedy lives in an unruled OQ nobody owns.**
`command-palette.tsx:183-190` is a statically disabled row with no `onSelect`; the file's last commit
is `661e9448` (P2 #362) — P3 and all eleven trains left it alone. The code's stated rationale ("*if
an action has no named backend verb*") is stale: 46 distinct door names now reach `callDoor`, and the
addendum enumerates 27 grant-proven wake verbs with the owner's 2026-08-24 direction to build the Do
shape "*now*, gated behind a live allowlist check". The only named next step anywhere is
`port-wave-plan-2026-08-28-part2.md:402-408` **OQ-6**, a *recommendation* ("light it in the P6 global
polish PR") that the 08-28 sitting never dispositioned — `grep "OQ-" mohe-grill-rulings-2026-08-28.md`
returns zero hits. 裁-9's P6 scope does not name Do. **Fix:** carry OQ-6 into P6's ruled scope or the
owner batch so it stops being a recommendation nobody owns. *(The false label is MBB-6 and should
land immediately, independent of when Do lights.)*

**P-2 · Mobbin MCP: an owner ruling from 08-27 that ~20 code PRs failed to carry, plus a downstream
doc that already claims it landed.** `mohe-grill-rulings-2026-08-27-evening.md:42-46` (R5): "*add the
Mobbin MCP server to the repo's `.mcp.json` (next PR), making … discoverable by every future lane,
not just this session*". `.mcp.json` read this session: two servers, no mobbin; `git log -- .mcp.json`
returns a **single** commit (`585346f0`, #246), i.e. untouched since long before the ruling.
Independently re-confirmed by another lane at `p4-mobbin-grounding-2026-08-28.md:258-263`. **There is
no credential blocker** — the user-scope entry is `{"type":"http","url":"https://api.mobbin.com/mcp"}`,
OAuth per-user at connect time, so committing it is four lines with zero exposure under constraint 4.
**Worse:** `port-wave-plan-2026-08-28-part2.md:419` already asserts as accomplished fact that R5
"*put the Mobbin MCP into the repo's `.mcp.json`*" — a doc claiming a thing that does not exist, the
exact review-law-2 failure. **Fix:** the four-line stanza + correct that sentence in the same change +
a tracked row (two independent audits have now found this and neither landed one). **Bind to P6's
entry gate**, where 裁-9 makes the Mobbin references a named re-check resource.

**P-3 · `apps/web/README.md` states things about the shipped product that are false, in the file the
package's own AGENTS.md designates as the full reference.** `:3` still reads "*P1–P3 merged in full;
the port wave's T0 seam is in flight*" (read this session) — last touched by `0b1b3f42`, the T0 seam
PR itself, with all eleven trains merging after it and none re-truing it. Two harder ones: `:104-105`
"*The workbench tab pages are placeholder shells*" and `:289-291` "*Still absent: … journals,
documents, bank, close, reports, registers, knowledge all build in P3*" — contradicted by the real
workbenches those routes mount. `apps/web/AGENTS.md:4` routes every agent here ("Full reference:
`README.md`"), so a lane grounding per the harness is told the workbench does not exist. Not covered
by any gate: `check-harness-links.mjs` parses link resolvability, not status truth, and this file is
not a harness-menu row. **Fix:** three-line docs truing, eligible for the single-lane docs-only
review (constraint 3 / ADR-0069). *The design-system content — token provenance, role separations,
prohibitions — is unaffected and remains accurate.*

**P-4 · `docs/design/DESIGN_SYSTEM.md` and `FRONTEND.md` route readers to the superseded app.** Both
are deliberate skeletons by owner ruling (Q7-B; real content lands at Wave G, tracked at
`PROGRESS.md:311` "design trio population") — that part is fine. What is not: `DESIGN_SYSTEM.md:49-52`
and `FRONTEND.md:37-41` still describe `apps/web` as being on branch `frontend/web` and name
`apps/dashboard`'s CSS-Modules surfaces as "*the only source of truth for current frontend
behavior*". `apps/web` is on main with 502 tracked files. A reader following AGENTS.md's `docs/design/`
row is pointed away from the tokenized, contrast-gated system toward the retiring one. **Fix:**
one-line truing in each; the emptiness stays scheduled.

**P-5 · F-T1 and F-T3 have no frontend surface *designed*, and F-T2's only designed page targets the
app that retires at cutover.** A grep for `apps/web|page.tsx|frontend` across all five
`sst-engine-*.md` and five `tax-computation-*.md` returns **zero** hits;
`payroll-calendar-design.md:332-355` names "*One page. A new calendar/page.tsx under
`apps/dashboard/app/`*". Every other lane names its frontend home. Not a build gap — there is nothing
to wire, and a page over a non-existent engine would be a fake control — but an **IA decision worth
one named PROGRESS row now**, before three lanes each invent their own answer.

---

### RECORD-ONLY (3)

**R-1 · The wake allowlist is name-bound, not signature-bound — and the record's stated safety basis
is itself wrong.** `0002_foundation.sql:247-251` keys `wake_fn_allowlist` on bare `(wake_kind,
function_name)` text; `assert_wake_allowed` (`0004:113-119`) matches on the name, so a later
same-name overload inherits the reviewed authorization. That is AGENTS.md review law 3 standing
unenforced in the estate's own authorization spine. **Correctly record-only** — exploiting it needs a
same-name overload, i.e. a migration through the full ADR-061 ladder, and the EXECUTE grant *is*
signature-bound (`0126:2105-2106`; `0143:435` drops the 8-arg before creating the 9-arg precisely to
avoid a shadowed door). **But the record's mitigating sentence must be re-worded:** it says "*safe
today (one `pg_proc` row per name, and the 0143 tail asserts it)*". What the 0143 tail actually
asserts is that both allowlist **rows** survive exactly once, plus a one-overload check for the single
verb it recut. It is a one-shot, apply-time, two-name check — **not** a standing assertion of one
`pg_proc` row per allowlisted name. `wake-allowlist-roster.mjs` is likewise a census of rows, not of
`pg_proc`. Absence-from-the-wrong-instrument, applied to the record's own instrument.

**R-2 · `counterparty_aliases_visible` is live and granted with zero readers, and truing it will
trip three test pins.** Confirmed this session: `0145:960-964` creates the masked view and grants
SELECT to `clara_authenticated`; `grep -rn "counterparty_aliases_visible" apps/web/` → **zero hits**;
`RetireCounterpartyAliasDialog.tsx` exists and is imported by nothing. Tracked with a named next step
(`PROGRESS.md:132`, in flight), so **not a gap** — but the wiring PR carries a merge checklist the
tracking line does not mention: **six** stale comment sites assert the read does not exist
(`counterparty-hygiene-panel.tsx:10-20`, `en.json:1876`, `lib/registers/counterparty.ts:26-28,96-104,358`,
`RetireCounterpartyAliasDialog.tsx:3-5`), and **three tests positively pin the absence** and will go
red or vacuous — `counterparty.test.ts:203` asserts "*exactly two reads … no counterparty_aliases
read*", plus two a11y/keyboard tests stubbing a 403. *(Those stubs target the base table, which is
still correctly denied — they are aimed at the wrong relation now, not wrong.)*

**R-3 · Two owner-ruled door dispositions have no follow-through.** `port-wave-plan-2026-08-28.md:82`
excepted three doors by owner ruling with named destinations: "*`verify_snapshot` → a DR runbook line
· `get_journal_entry` (single-arg) → retirement candidate · `record_notification` → verify-then-decide*".
`grep -rn "verify_snapshot" docs/ops/` returns **zero** — the DR runbook line was never written; and
`record_notification`'s "verify-then-decide" has no recorded verdict in PROGRESS. Two lines of
documentation follow-through on already-ruled exceptions, owed at the P6 exit gate.

---

## 3 · Refuted gaps — what was checked and dropped

Every row was a filed candidate that two independent passes could not sustain. Kept here so the owner
sees the coverage, not only the residue.

| # | Candidate gap | Why refuted |
|---|---|---|
| 1 | `list_open_items_by_counterparty` silently returns `[]` for every counterparty (M9) | **Defect is real and confirmed** (`0038_wave_c_b_bank.sql:8006` passes `c.firm` into `_canonical_counterparty(p_client,…)` → NULL → `[]`; dead since 0038). Refuted as an *alignment gap only*: tracked verbatim in `PROGRESS.md` Known issues, ruled (OQ-6 → 裁-24, "fix M9 inside PR-1"), patch already written out as a diff in `counterparty-merge-annexes.md:68-77`, acceptance cells A-7/A-8 specified, blast radius lensed (L9). *Residual carried into §4 as SILENT-RISK: the 3-line fix is chained to a lane whose gate has not run.* Evidence correction: the filed path `0038_wave_c_g2_bank_matching.sql` does not exist. |
| 2 | Eight 0141/0145 firm-creation/invite doors have zero apps/web call sites | Measurement true; it is the **planned state of a sequenced lane**. Routed out of the port wave by name (`port-wave-plan-2026-08-28.md:81`, `:375-378`), merged design of record #376 with per-file target paths (`p4-design-…-annex-2.md:11-40`), owner ruling on all three tiers (`harness-audit-rulings-2026-08-26.md:122-128`), tracked at `PROGRESS.md:133`. `create_firm` also mis-classed as homeless — it has a live dashboard home. |
| 3 | Eight of the 29 orphan doors remain wired nowhere | **Factually wrong by 2** — `request_autodraft` and `request_reextraction` are fully wired with UI call sites (verified this session, §1.1). Of the rest, 3 are owner-excepted, 3 routed to P4, and `create_account_set_v1` carries the exact honest NotBuiltNote the finding said was missing, plus a RETIRE ruling (裁-12). |
| 4 | The counterparty-hygiene NotBuiltNote is stale now that `0145` shipped the read | Tracked with a named next step (`PROGRESS.md:132`, in-flight; 裁-11 ruling at `:363`; the migration itself names T8's panel as the home). Also: the panel's *stated fact* (no base-table read policy) is still TRUE — 0145 deliberately shipped a masked view, not a table grant. Only the inference went stale. *(Residual → R-2.)* |
| 5 | Four NotBuiltNote instances confirmed accurate — recorded for completeness | All four verified accurate at the grant, so nothing to file; and the "don't re-spend budget" conclusion over-claims — there are **7** NotBuiltNote sites, not 4. |
| 6 | Tax / SST engine / payroll calendar have zero frontend | Premise over-broad ("SST" has a live compliance-watch register, ⌘K entry, and future-attestation panel; only the *engine* is absent), and all three are downstream of unbuilt/ungranted backends with owner-scoped sequencing. *(Residual → P-5, the IA decision.)* |
| 7 | Firm admin cannot invite/see roster/see usage; invites need the Supabase dashboard | Backend is **built, merged and ceremonied live** (0141: `invite_member`, `accept_invite`, `revoke_invite`, `firm_members_visible`, `firm_invites_visible`); the cited evidence describes the invite *email template* being Supabase-configured, not the invite-send act. UI is the tracked P4 tranche. |
| 8 | No object-level "add a new client" affordance anywhere | **Premise false.** A labeled, always-visible `Begin client onboarding` button is mounted app-wide via the rail (`layout.tsx:60` → `rail-mount.tsx:26` → `ClaraThreadView.tsx:82` → `OnboardingChecklistCard.tsx:71` → `BeginOnboardingCard`), rail defaults open (`threadStore.ts:59`), pinned by three tests. The cited files were the register page, where R7 deliberately put nothing. |
| 9 | Freeform "ask the books" is read-only; PROGRESS calls it a still-open gap | PROGRESS is **accurate** — `clara.list_freeform_reads` genuinely does not exist (zero hits across all migrations); the panel reads the base table under 0131's grant. The handoff row is a dated snapshot with a filed errata correcting row 23 by number. |
| 10 | 9 of 10 receipt part kinds are never emitted by the backend at all | Documented, deliberate forward-declaration with the reason at the declaration site (constraint 9 freezes `chatTurn` bodies); ruled into P6's `chatTurn_v15` (裁-20); and 3 of the 9 render live from queue rows in the dashboard. **This refutation surfaced MBB-4, the converse defect.** |
| 11 | The P6 four-part wire bump is not in the ClaraPart union | Owner-ruled twice (Q8, 裁-20), named as the next step in `PROGRESS.md:112`, plan-of-record wave with the exact catalog delta (18→22), and self-documented at `types.ts:7-10`. |
| 12 | `open_question` names two unrelated mechanisms | **Premise inverted.** One table (`clara.open_questions`), one PK, one read (`get_open_question`), one door pair — the needs-you row and the chat card are two views of the same row, and the dashboard literally constructs the part *from* the row (`queueKindCatalog.ts:206-209`). Law 3 used backwards. |
| 13 | needs-you compliance/lint detail objects are unused | **False for compliance:** `lib/firm-admin/compliance.ts:87-101` consumes `env.compliance` and `compliance-register-panel.tsx:120-149` renders every per-client field on a live route. No per-client `lint` detail object exists in the DB at all (`0017:627-631` builds a single boolean). Both row kinds also carry inline governed acts, not just counts. |
| 14 | The 10th needs-you row_kind (裁-18b) is mid-design | Cited gate record is a **superseded body** — the live file reads "*CLOSED — all eight RULED 2026-08-29 (裁-25)*", with PR-2 the tenth row_kind in a numbered five-PR sequence tracked at `PROGRESS.md:129`. |
| 15 | WCAG 2.2 target-size gate does not exist | Owner-RULED 裁-13 on 2026-08-28 ("*adopt in the P6 polish wave as a real a11y CI gate*", naming the exact file), in the minted pre-beta queue and in `PROGRESS.md:110`'s Next. *(Two stale "OWNER QUESTION" strings owed a truing.)* |
| 16 | Clara mascot has no asset or component | Owner-RULED IN 裁-14 ("*port the asset and implement under the contract's rules exactly*"); the finding quoted the pre-ruling hedge. Backlog row at `PROGRESS.md:189`. |
| 17 | Focus-ring treatment diverges from token contract §9 | Owner-ruled R3 (a founder amendment of §9), classified DIVERGED-BY-RULING in the 08-28 conformance audit, and the owed recut PR is a named next step in `PROGRESS.md:110`. *(One stale "not resolved either direction" comment in globals.css.)* |
| 18 | `docs/design/*` are empty skeletons while apps/web shipped a real system | Deliberate per owner ruling Q7-B, tracked as "design trio population" at `PROGRESS.md:311`. *(Residual → P-4: the stale branch/ground-truth statements.)* |
| 19 | PROGRESS's "11 i18n namespaces" claim unverified | Verified: `en.json` has 34 top-level keys, the last eleven being exactly the T1–T11 blocks pre-landed by the T0 seam, with the ownership table at `i18n/request.ts:20-38`. |
| 20 | Three owner-named design skills never resolved or substituted | `ui-ux-pro-max` carried its substitute (`impeccable`) in the same handoff sentence, and that substitute became a per-surface acceptance gate; the roster was ruled fresh on 08-27 and audited 08-28; GSAP's non-use is legible from the package.json + the CSS-first Emil discipline. |
| 21 | Playwright named "mandatory" but has zero footprint | "Mandatory" is bound to `context7` in that sentence, not playwright; playwright is an MCP (no repo footprint by construction, `.gitignore:72-73` carries its output dir), and the browser-driven leg is the tracked Q9 rung-5 live walk. |
| 22 | shadcn MCP pinned 4.12.0 vs dependency 4.19.0 | Drift is inert: the MCP hardcodes `shadcn@latest` in its add-command in **both** versions (verified by calling the pinned server and by reading both dist chunks), registry content is fetched live (61 current items incl. `native-select`), and tool surfaces are identical. |
| 23 | Vercel plugin enabled but deploy target is Cloudflare | Premise inverted: ADR-008 ratifies **Vercel AI SDK 7 + Workflow DevKit** as the runtime (`ai@7.0.77`, `workflow@4.8.4`, imported live), and `vercel:nextjs`/`vercel:shadcn` target apps/web's actual stack. Only the host-platform subset is inapplicable. |
| 24 | No Context7 citation for the frontend version pins | AGENTS.md says "*Context7 **or** internet official sources*", not blanket-Context7; PR #357's body cites context7 for the pin decision with a derived finding (16.2.x fails OpenNext's peer range); and five in-code `apps/web` citations dated 2026-08-27 were missed by the census. |
| 25 | The checked-out branch's PROGRESS.md was 4 commits / 5.5h behind | The "stale" text and the "true" text landed in the **same commit** (#416 wrote both PROGRESS and the 0147 as-run), and the reflog shows the two states never co-existed. Real content-divergence window ≈ 28 minutes. |
| 26 | BELCORT's `is_operator` flag never set — wake registry permanently dark | Causal premise false: neither `bankAgent` nor `closePrep` workflow body exists (`startWorld.ts:222` says so), so the flag is not the binding constraint. Tracked in four places + a complete 296-line runbook (`docs/ops/g1-operator-firm-ceremony.md`). |
| 27 | P6 has no design doc, no gate, no branch | `port-wave-plan-2026-08-28-part2.md:124-180` §8 specifies both P6 deliverables at build detail (incl. the cutover PR's 61-suite four-way classification); entry gate is 裁-9's third conformance pass, exit gates are §9.1/§9.2. "No branch" is what an unstarted lane looks like. |
| 28 | Tier-3 self-serve is LIVE AT BETA but Stripe has zero code | Owner recorded the impact himself: it blocks the **checkout wiring**, not beta; 裁-28 has a named deadline and its market-half brief landed today (#418). *(Genuine residual, re-cut smaller: the dissent's **other two limbs** — per-firm DPA e-sign and anti-abuse controls — appear in no PROGRESS row, no lane, no owner. Worth naming as the tier-3 security gate's contents.)* |
| 29 | 裁-19's OQ-1 hybrid added a write door with no adversarial gate | The owner chose the variant that **keeps** `_tf_append_only` (the pair is an INSERT); the gate is correctly OPEN and blocking; the design set was already amended on main; the quoted "single most likely blocker" line belongs to L5, not L4. *(Real residual surfaced: the write half collides with 裁-24's own OQ-3 ruling on `_metric_input_dataset_v1` — a ruled answer against a ruled answer, self-surfaced by the build lane.)* |
| 30 | F-T1 and F-A8 sit unmerged with no D1 window | Neither migration **needs** a D1 window (both headers say so). Both are in the named post-磨合 queue, and F-T1's deferral is owner-ruled ("*lands pre-beta if it fits, else opens the beta window*"). *(Residual: `PROGRESS.md:105` records F-A8 as `design` while 982 lines of built migration sit on the branch; both branches are ~125 commits behind with a `frozen-evaluators.json` conflict already measurable.)* |
| 31 | F-A7b has only PR-a merged while T11's frontend is live | T11 calls **zero** PR-b..f doors — it ports the pre-existing wave-B human keyed-plan flow (five 0017-era doors), stated verbatim at `lib/onboarding/types.ts:9-12`; the ordering is owner-ruled 裁-8 ("*T11 never precedes F-A7b's merge*"). *(Residual: `needs-you-gaps.ts:34-40` pins six firm-question kinds while `0142:222` widened the DB to seven — cosmetic only, renderer is fail-soft.)* |
| 32 | R9's storage CI battery and role re-examination are absent | `packages/runtime/tests/storage-probe.test.mjs` **exists** (235 lines, in CI) with a live-SQL grant-surface pin and three rejection mutants; `/ready` carries the storage check at `health.mjs:302-316`. *(Residuals: the GRANT-LIST half is still uncovered; R9(c) is genuinely unruled; and `PROGRESS.md:352` is stale, which is what seeded the claim.)* |
| 33 | Untracked research files prove lanes share a working tree | mtime forensics + reflog show a `pull --ff-only` at 17:22:16 delivering tracked #418 content, not a lane write; the research lane ran in its own worktree on its own branch with its own PR. |

---

## 4 · Backend residual queue — SILENT-RISK rows first

**SILENT-RISK** = real, currently true, no owning PR *and* no test watching it.

| Item | Status | Proof | Next step |
|---|---|---|---|
| **M9 · `list_open_items_by_counterparty` returns `[]` always** | LIVE DEFECT, unfixed since 0038; fix ruled but **chained to a lane whose gate has not run** | `0038_wave_c_b_bank.sql:8006` passes `c.firm` into `_canonical_counterparty(p_client,…)` (`0011:1316-1324`); only test cell asserts EMPTY (`x38…:1838`), i.e. vacuous | Sever into a standalone 1-token migration + a positive-control cell, **or** confirm 裁-19 PR-1's gate runs soon. Blocks the settle-from-bank-line picker for every counterparty in every client |
| **Identifier-promotion duplicate-open wall absent** | UNBUILT, no owner, no test; record's mitigation is **factually false** | `0103:830-831` plain (not unique) index; `_identifier_promotion_core:833-864` inserts unconditionally; `client_identifiers` has no unique constraint (`0007:235`); Door 2's wall is a body check (`0142:456-461`), not an index | Unique partial index + typed-refusal map + one RED cell. No D1 window. **→ MBB-7(a)** |
| **`trigger_id` = credential uuid, contract says task/turn** | UNBUILT, no test — and **scheduled to spread to a 9th receipt table** | Contract `0103:274`; writers `0126:1580`, `0126:1922`, `0142:491`; propagation by design at `binding-proposal-design.md:313-315` | Mint the `wake_credential` trigger_kind **before** 裁-18b's ninth member lands. **→ MBB-7(b)** |
| **Wake allowlist name-bound, not regprocedure-bound** | UNBUILT; correctly low-risk, but the record's safety basis is mis-stated | `0002:247-251` bare text PK; `assert_wake_allowed` (`0004:113-119`) matches the name; the 0143 tail is a one-shot two-name apply-time check, not a standing guard | Re-word the record now; key on regprocedure when convenient. **→ R-1** |
| **R1 judgement-confidence conjunct drop** | UNBUILT, conjunct still live | grep-confirmed `0124:300`, `0125:421/465/570` | Future migration; no owner |
| **R9(b) storage grant-list battery** | PARTIAL — the RLS-predicate half **is** pinned in CI; the grant-list half is not | `storage-probe.test.mjs:207-236` reads live `storage-provision.sql` and asserts both predicates + 3 rejection mutants; nothing asserts the GRANT list or the deliberate absence of UPDATE/DELETE | Extend the same test. Also **true `PROGRESS.md:352`**, which still claims `/ready` carries no storage check (shipped #358) |
| **R9(c) storage-role re-examination** | UNBUILT, **unruled**, in no owner batch | `incident-2026-07-26-intake-storage.md:268-271`; not in `mohe-owner-batch-2026-08-29.md` | Needs a quick owner/lane check; can follow beta |
| **`counterparty_aliases_visible` live+granted, zero readers** | Tracked in-flight, but the wiring PR will trip 3 test pins + 6 stale comments | `0145:960-964`; `grep apps/web` → 0 hits (this session) | Merge checklist on the already-scheduled T8 wiring. **→ R-2** |
| **`verify_snapshot` → DR runbook line; `record_notification` → verify-then-decide** | RULED dispositions, **no follow-through landed** | `port-wave-plan-2026-08-28.md:82`; `grep verify_snapshot docs/ops/` → zero | Two doc lines at the P6 exit gate. **→ R-3** |

**Merged and live (pre-beta backend queue is closed):**

| Item | Status | Proof |
|---|---|---|
| 裁-15 `security_barrier` ×11 views | MERGED + LIVE | `0144` (#410) |
| 裁-16 hash-only bearer tokens ×2 | MERGED + APPLIED, live 142/`0147` | `mohe-0147-apply-asrun.md` (#414) |
| 裁-17 ninth needs-you `row_kind` | MERGED + LIVE | `0146` (#412) |
| 裁-18a signer≠proposer wall | MERGED + LIVE | bundled in `0144` (#410) |
| 裁-22 DB-resolved proposal bases | MERGED + LIVE | `0143` (#409) |
| P4 backend tranches 1+2 | MERGED + LIVE | `0141` (#396), `0145` (#411) |
| F-A9 metering PR-1A | MERGED | `0110` (#317) |
| F-A7b PR-a | MERGED | `0142` (#401) |
| 裁-23…裁-28 folded into docs | MERGED | `4183f5e9` (#416) |

**Ruled, unbuilt, scheduled:**

| Item | Status | Next step |
|---|---|---|
| 裁-18b binding-proposal door | Gate CLOSED on owner Q&A only; 0 PRs opened; build lane authoring | **MBB-3** — run the design gate or rule the narrowing |
| 裁-19 counterparty merge/un-merge | HYBRID ruled (裁-24); gate correctly OPEN and blocking; build authoring in a worktree | Run the gate. Watch the ruled-vs-ruled collision on `_metric_input_dataset_v1` (OQ-3) |
| 裁-21 firm COA template | Gate CLOSED; **PR-0 is the gate**, research lane precedes it (#418 landed the research) | PR-0 with its seven replay obligations |
| 裁-12 retire `create_account_set_v1` | RULED, not executed | Retirement migration |
| 裁-13 / 裁-14 / 裁-20 / 裁-27 | RULED → P6 | P6 has spec (§8 of the port-wave plan) but no consolidated scope doc |
| 裁-26 admission-token email wall | RULED → P4 UI tranche; **default until then: bearer** | Rides P4 UI |
| 裁-28 pricing amounts | NOT ruled; market-half brief landed (#418), cost-floor half owed | Blocks checkout wiring, not beta |
| P4 frontend UI tranche | NOT STARTED (design-only branch) | Owner's pricing sitting precedes checkout wiring |
| P6 polish wave | Specified in §8; no consolidated scope doc; scope accreting | Write the P6 build doc as P6 entry's first act |
| Wave G reset + e2e | Contract of record exists; **oracle gaps open** | **MBB-1** |
| `0133` operator-flag act | Not done; 0 firms carry `is_operator` — but the wake bodies don't exist either | Fold into the Wave-G estate-setup checklist |
| Tier-3 self-serve | Ruled LIVE AT BETA; dissent's DPA e-sign + anti-abuse limbs **untracked** | Enumerate the tier-3 security gate's contents |

**Built, unmerged:**

| Item | Status | Next step |
|---|---|---|
| F-T1 SST engine PR-1 | Built + reviewed, unmerged, ~125 commits behind, **no D1 owed** | Owner-ruled it may open the beta window |
| F-A8 internet lane PR-1 | Built (982 lines), **no review record found**, unmerged, ~128 behind, `frozen-evaluators.json` conflict measurable | `PROGRESS.md:105` still says `design` — true the lane row |

**Unbuilt, no lane:** F-A5b PR-3 byte-burn render worker (blocks the first real seal/byte-repro DR
drill) · F-A6 v2 + F-A6 PR-2 runtime (H-4/H-5/S-1 obligations) · F-T2 rows/logic · **F-T3** ·
F-T4's remaining 4 PRs · F-A7b PR-b..f · F-A3 PR-3/C2 digest binding · `0057` §11 writer-roster
successor · `0007` firm-limits pseudo-upsert · `closing_stock` producer · `opening_tb.line` producer ·
δ named residuals (5) · F-A7 γ residuals R1/R2/R3 · `wake_propose_identifier_promotion` dup-open wall.

---

## 5 · Could not verify

**Instrument limits (read-only, no docker, no rig, no live DB):**

- **Direction 1's denominator** — the true current count of `clara_authenticated` EXECUTE-granted
  functions. The 08-28 figure (247 + 3 views) came from a live `pg_proc`/grant read on a throwaway
  rig, and that census's own header states migration-text grep is unreliable here because of revokes.
  Only the WIRED side is measured in this report.
- **Live-resolution of the 167 verbs + 39 relations against the live grant table with matching
  signatures.** Call-site existence is measured; a sample was checked against migration source; a
  full live resolution pass was not run.
- **All "live" claims** (row counts, `firms.is_operator` values, `wake_engine_sources.enabled`,
  trial-balance figures) are taken from ceremony as-run documents and migration-tail assertions, not
  a fresh query.
- **Whether `pnpm test` / `pnpm lint` are green at HEAD** — files were read, not executed.
- **Whether `apps/web` is the surface a beta user reaches today** vs the outgoing `apps/dashboard`
  still serving `app.clarabook.com`. PROGRESS's Runtime section names only the Pages deployment;
  `apps/web` targets Cloudflare Workers; the P6 cutover PR is pending. No repo evidence either way,
  and absence is not proof — needs a deploy-record check outside repo contents.

**Specific to MBB-4 (the new finding):** I verified the emitter constructs and pushes all four kinds
and that neither renderer's union contains them. I did **not** verify that a live thread has yet
carried one — that depends on whether the bank-act and posting tools actually fire in production
traffic. If they have not, the defect is latent rather than realized; either way the wire/renderer
mismatch is real and the fix is the same.

**Coverage limits:**

- The four lenses' greps are pattern searches, not file-by-file reads of all 261 `apps/web`
  components. A violation using an unsearched pattern (e.g. a raw `rgb()`/`hsl()`/`oklch()` literal)
  would not have been caught.
- Dynamic-dispatch `callDoor` sites: one targeted grep found the single instance
  (`aging.ts:64-65`); this is not an exhaustive proof there are no others.
- Runtime behaviour of dialogs/keyboard flows inside built pages was sampled at the route/component-
  header level and cross-checked against per-train fix-round records, not re-read line by line.
- `apps/dashboard` was out of scope except where it refuted an `apps/web` claim.
- `docs/adr/README.md` §5/§10 digest addenda for R4/R5/R7 were not opened — only that their source
  documents exist.

**Concurrency caveat:** ~100 lanes were active during this pass, several with uncommitted build work
in locked worktrees (裁-18b PR-1, 裁-19 PR-1, COA PR-a). `origin/main` advanced once mid-audit
(`4183f5e9` → `7e9180df`). Any row here may have moved.
