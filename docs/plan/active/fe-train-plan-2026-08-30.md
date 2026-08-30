# The FRONTEND train plan — P4 (firm · members · registration) + P6 (deepest polish + cutover)

*Planner lane `fe-train-plan`, 2026-08-30. **Plan only — no app code in this lane.** Measured
against `origin/main` at **`94afbbef`** (#439), repo frontier `0155`, live 148/`0153`, runtime
Fly tag **v69** serving `chatTurn: chatTurn_v15`. Every structural claim below is a positive
read at `file:line` on that tip — where a claim is a derivation, it says so.*

**Ruling basis.** [`mohe-grill-rulings-2026-08-27.md`](mohe-grill-rulings-2026-08-27.md) (Q1-Q9,
Q-A…Q-F) · [`mohe-grill-rulings-2026-08-27-evening.md`](mohe-grill-rulings-2026-08-27-evening.md)
(R1-R7) · [`mohe-grill-rulings-2026-08-28.md`](mohe-grill-rulings-2026-08-28.md) (裁-1…裁-28) ·
[`mohe-grill-rulings-2026-08-29.md`](mohe-grill-rulings-2026-08-29.md) (裁-29…裁-44) ·
[`mohe-grill-rulings-2026-08-30.md`](mohe-grill-rulings-2026-08-30.md) (裁-45…裁-56).
**Design basis.** [`p4-design-2026-08-27.md`](p4-design-2026-08-27.md) + its two annexes ·
[`p4-mobbin-grounding-2026-08-28.md`](p4-mobbin-grounding-2026-08-28.md) ·
[`port-wave-plan-2026-08-28-part2.md`](port-wave-plan-2026-08-28-part2.md) §8/§9 ·
[`clarabook-resource-audit-2026-08-28.md`](clarabook-resource-audit-2026-08-28.md) ·
[`mohe-alignment-audit-2026-08-29.md`](mohe-alignment-audit-2026-08-29.md) ·
[`billing-design.md`](billing-design.md) §5 · `apps/web/AGENTS.md` · `apps/web/README.md`.

**Companions — the self-contained work orders** (files, commands, acceptance) per
`.claude/rules/handoffs.md`. This document is the shape and the reasoning; those are what a builder
lane executes: **[`fe-train-plan-2026-08-30-orders-p4.md`](fe-train-plan-2026-08-30-orders-p4.md)**
(the shared preamble every order inherits, plus P4-1…P4-5 and P4-D) ·
**[`fe-train-plan-2026-08-30-orders-p6.md`](fe-train-plan-2026-08-30-orders-p6.md)**
(P6-1…P6-6, P6-T and the P6-X cutover).

---

## 0 · Four truings this plan carries, each measured before any train was scoped

**① `chatTurn_v15` is TAKEN, and it added NO part kind — so P6's four-card bump is `chatTurn_v16`.**
Every prior document (裁-9, 裁-20, `port-wave-plan-…-part2.md` §8.1, `PROGRESS.md`'s frontend row,
`apps/web/README.md`) names the bump *"`chatTurn_v15`"*. That version number was consumed on
2026-08-29 by **F-A6 PR-2** (the audited freeform read, #423, deployed Fly v69) and its own frozen
header says so in words: `packages/runtime/workflows/chatTurn.v15.prompt.ts:10` —
*"`ClaraPartV15` IS `ClaraPartV14`, DELIBERATELY — NO NEW PART KIND … the `freeform_result` card
belongs to P6's own later batched wire bump"*; `:33` `export type ClaraPartV15 = ClaraPartV14;`.
`registry.ts:61` reads `chatTurn: chatTurn_v15`. **The four Q8 parts therefore need a new
`chatTurn_v16` export + a registry repoint** (hard constraint 9 — a frozen body is never edited).
This is a naming truing, not a scope change; the work is identical.

**② The catalog is 22, not 18 — MBB-4 is CLOSED, and the bump lands 26.**
`apps/web/lib/parts/types.ts:178-200` declares 22 union members; `:12-16` records the four
`chatTurn_v14` receipt kinds (`entry_posted`, `question_opened`, `bank_act`, `bank_pack`) joining
on 2026-08-29, and `apps/web/components/parts/V14ReceiptCards.tsx` renders all four. So the MBB-4
("four kinds neither frontend can render") no longer holds, and §8.1's *"18 + 4 = 22"* arithmetic
is superseded: **22 + 4 = 26** — a figure the file's own header at `:15` already states, so this
truing is corroborated by the declarer, not only by this lane's count.

**③ 裁-1, 裁-2 (4a/4b/4c) and 裁-13 are ALL UNEXECUTED at the tip.** Measured, not assumed:
`grep -rl "ring-ring/50" apps/web/components/` returns the same **ten** carriers annex 2 §F
censused, every one still at **`/50`**, not 裁-1's ruled `/70`. `app/globals.css:247` still reads
`--input: #c7c5bd`. There is **no** `--color-identity-canvas` bridge in `@theme inline` and **no**
`app/(entry)/` route group. `grep -rn "target-size\|--target-min" apps/web/test/` returns zero.
These are the four polish rulings that have been ruled longest and executed least.

**④ The 08-29 alignment audit's agent-buildable findings LANDED; two remain.** Verified at this
tip: MBB-5 closed — `apps/web/lib/command/routes.ts` reads `status: "built"` on all fifteen rows,
`needsYou` → /needs-you, and `apps/web/lib/command/routes.test.ts` (lines 27, 46, 107) derives its
oracle from the live app tree with a vacuity control, closing the class. MBB-8 closed —
`eslint.config.mjs:66-78` carries `NO_RAW_COLOR_VALUES` + `NO_TAILWIND_DEFAULT_PALETTE` scoped to
`app/**` + `components/**`. P-2 closed — `.mcp.json` carries the `mobbin` HTTP server. P-3 closed —
`apps/web/README.md:13-17` carries its own dated truing note. **Still open and owed to P6: P-1**
(⌘K "Do", now ruled 裁-37) and **P-5** (Track B's IA, now ruled 裁-34).

---

## 1 · Measured state of `apps/web` at `94afbbef`

### 1.1 Routes — 19 pages, 2 route handlers, 5 layouts

```
app/(firm)/          page · needs-you · clients · activity · admin · admin/compliance ·
                     admin/vendor-bindings · clients/[clientId] + its 7 tabs (journals ·
                     documents · bank · close · reports · registers · knowledge)
app/(full)/          clara/[threadId] · clients/[clientId]/clara/[threadId]
app/                 login · invite/[token] · logout (route) · api/runtime/[...path] (route)
```

**Nothing exists at** /signup, /pending, /admin/members, /admin/registrations, /admin/tiers,
/admin/billing, /clients/:clientId/tax, or an `(entry)` route group. There is **no**
require-firm-scope module (`grep -rn "requireFirmScope" apps/web/` → zero hits).

### 1.2 The parts union — 22 members, 5 rich + 4 v14 cards + 10 id-only summaries

`lib/parts/types.ts:178-200`. Rich today: `text` · `attachment` · `clarify` · `clarify_closed` ·
`refusal`, plus the four `V14ReceiptCards`. `PartRenderer.tsx:45-67` routes ten kinds
(`je_review`, `doc_review`, `diff`, `sweep_receipt`, `open_question`, `bank_recon_receipt`,
`fixed_asset`, `depreciation_run_receipt`, `adjustment_run_receipt`, `staff_advance`) into
`PartSummaryCard`; `:24` `FALLBACK_UNSUPPORTED_PREFIX` is the fail-closed chip. The
`AllCovered`/`NoExtra` guards in `catalog.ts` make a missing entry a `tsc` failure.

### 1.3 Doors and reads — the P4 surface is LIVE and wired to nothing

Live at `0141`/`0145`, with the **live bodies chased past both** (the superseded-body class —
`0147` replaced two of them):

| Object | Live body | Floor | Frontend home today |
|---|---|---|---|
| `clara.claim_identity(text, text)` | `0141:250` | authenticated, **no membership** | none |
| `clara.request_firm_registration(text, text, text)` | `0145:370` | authenticated; CLR09 if already a member or an open request | none |
| `clara.approve_firm_registration(uuid, text)` | `0145:766` | **owner+ AND `is_operator`** | none |
| `clara.reject_firm_registration(uuid, text, text)` | `0145:832` | same | none |
| `clara.invite_member(text, text, text)` | **`0147:372`** | admin+, role-ceiling walled | none |
| `clara.accept_invite(text, text, text)` | **`0145:694`** | authenticated; JWT-email wall | none |
| `clara.revoke_invite(uuid, text)` | `0141:466` | admin+ | none |
| `clara.add_member(uuid, uuid, text, text)` | `0145:671` | admin+, ceiling | none |
| `clara.set_member_role(uuid, text, text)` | `0145:592` | admin+, ceiling, CLR09 last-owner | none |
| `clara.create_firm(text, uuid, text)` | **`0147:497`** | authenticated + admission token | dashboard only |
| `clara.firm_members_visible` | `0141:512` | roster bookkeeper+, **email admin+** | none |
| `clara.firm_invites_visible` | `0141:532` | admin+ | none |
| `clara.caller_context` | `0141:544` | self-scoped, 0-or-1 row | none |
| `clara.firm_registration_requests_visible` | `0145:911` | SELF or OPERATOR | none |
| `clara.counterparty_aliases_visible` | `0145:960` | firm-scoped | **none — R-2, still zero readers** |

Estate-wide the app calls ~167 door verbs and 39 relations (audit §1.1). The nine rows above are
the whole unbuilt P4 tranche plus one T8 ride-along.

### 1.4 Tests and gates

- **148 test files** (`apps/web/test/manifest.txt`, comment/blank lines excluded), run by
  `apps/web/scripts/run-tests.mjs`; `apps/web/scripts/check-test-manifest.mjs` + its selftest red
  the build on an unenumerated file.
- **Three a11y CI gates, all green:** `apps/web/scripts/check-token-contrast.mjs` (**27 declared
  pairs**, all PASS, unconditionally strict) · `apps/web/test/a11yRules.ts` (hand-written rule
  engine, no axe) · `apps/web/test/keyboardWalk.ts`. **A fourth is owed:** WCAG 2.2 SC 2.5.8
  target-size (裁-13) — absent.
- **Token contract:** the ClaraBook brand package verifies **42/42** (Q4/#357); the 27 gate pairs
  are the *contrast* subset of it, not the same number — those two figures are not comparable and
  no document should treat them as one.
- **Colour discipline:** zero raw hex, zero default-palette classes, zero `dark:` in
  `app/**`/`components/**`, now mechanically held by `eslint.config.mjs:66-78`.
- **The Q5 sibling ban — hardcoded UI strings — is still unbuilt** (`i18n/request.ts:8` and
  `README.md:76` both describe it in the future tense).

### 1.5 What the ClaraBook conformance audit still owes

From [`clarabook-resource-audit-2026-08-28.md`](clarabook-resource-audit-2026-08-28.md) §3/§4 and
R1: the **Clara mascot** asset (`apps/web/public/` holds five font files and nothing else) · the
**Ledger Fold** mark port · the **ClaraBook product-name copy pass** · the **focus-ring recut PR
owed to the `clarabook-frontend` repo** (R3/裁-1) · the **`--input` recut**, ruled to originate in
that same repo (裁-2 4c) · and the **third conformance pass** over the DESCRIPTIVE resources
(prototype screens and components), which 裁-9 makes **P6's ENTRY gate**, not only its exit.

---

## 2 · The P4 trains

**Five build orders, one DB order, two deferred surfaces.** The partition is by *file ownership*,
so five lanes can run concurrently without touching each other's tree: **P4-1** owns the new lib
modules + the two layouts + the runtime route handler; **P4-2** owns the new (entry) route group;
**P4-3** owns admin/members + the invite Route Handler; **P4-4** owns admin/registrations; **P4-5**
owns nav, ⌘K and the i18n truing. `apps/web/messages/en.json` is the one genuinely shared file —
§2.7 states the seam rule.

| # | Train | Doors / reads | Depends on | Size |
|---|---|---|---|---|
| **P4-1** | **The scope spine** — `requireFirmScope()`, one implementation, three entrances; the holding state's data | `caller_context`, `firm_registration_requests_visible` | — | 0.6 |
| **P4-2** | **The entry group** — `(entry)` route group on the identity canvas; signup; the holding page; invite-accept extended | `claim_identity`, `request_firm_registration`, `accept_invite` | P4-1 | 1.0 |
| **P4-3** | **Members, roles, invites** — the roster, the role menu, the invite dialog, the mail courier | `firm_members_visible`, `firm_invites_visible`, `invite_member`, `revoke_invite`, `set_member_role`, `remove_member` | P4-1 | 1.0 |
| **P4-4** | **The operator approval queue** — /admin/registrations, operator-only | `firm_registration_requests_visible`, `approve_firm_registration`, `reject_firm_registration` | P4-1 | 0.6 |
| **P4-5** | **Nav, ⌘K and the admin hub** — rank-shaped nav, five new route rows, the hub's sections | reads only | P4-2..4 merged | 0.3 |
| **P4-D** | **DB: 裁-26 + 裁-36** — the admission token's email binding; the DPA e-sign wall; the rate wall | new | its own mini-gate (§6 OQ-3) | 0.7 |

*Sizes are P3-lane equivalents on `port-wave-plan-…-part2.md` §10.1's calibration (1.0 ≈ 20-40
files, ~3,000-4,500 lines, full ladder).*

**P4 adds NO `parts[]` wire types** (design §9, a named non-goal). Its surfaces are pages and
forms; the catalog and its `tsc` guard are untouched, and the four-part bump stays P6's. A P4 order
that finds itself wanting a card has found a P6 scope question, not a build task.

**Two rules bind every P4 order.** (a) **Affordance shaping** (design §4 D): a whole surface below
the caller's rank is **hidden** from nav; an in-context verb above it is **shown disabled with the
required rank named**. Neither is a security boundary — `_human_ctx` is. (b) **No wall is
pre-empted.** The last-owner `CLR09`, the role-ceiling `CLR04` and the JWT-email `CLR04` are let
through and rendered **verbatim**; pre-disabling would be the UI guessing the DB's answer.

### 2.6 · Two P4 surfaces that are NAMED, HOMED and NOT BUILT

Both are in the work order's P4 list. Neither can be built at this tip, and building either would
be a fake control — `apps/web/AGENTS.md`'s outright prohibition. What they get instead is a named
home and a precondition, which is the mechanism the house already uses.

- **裁-46 · the binding-revocation reset door.** `reset_binding_revocation(uuid, text)` **does not
  exist** (`grep` across all 155 migrations → zero hits); it is ruled to ride **裁-18b PR-3**, which
  also owns a D1 window on `_approve_entry_core`. **Home:** the existing
  `apps/web/components/firm-admin/vendor-bindings-panel.tsx`, as a row-level admin action beside
  the decline/reset controls, on /admin/vendor-bindings. **Disposition:** a ride-along PR after
  PR-3 merges, ~0.2. Nothing ships before the door.
- **Billing / checkout.** [`billing-design.md`](billing-design.md) §5 makes the UI **billing PR-4**
  and calls it *"this is P4's checkout tranche"*, landing **with** 裁-36's DPA e-sign + rate wall
  and 裁-26's email-bound token. PR-1/2/3 (the configuration relations, the lifecycle doors, the
  `evaluate_firm_billing_v1` rollup, `get_firm_invoice`, the Stripe mirror) are **unbuilt**, and
  PR-1 carries the tranche's one D1 window. **Home:** /admin/billing under the admin hub,
  admin/owner only (裁-51). **What it must do when it runs:** every price renders through the one
  named placeholder component while `billing_plans.amounts_ruled = false` (裁-50 — never a number,
  never `RM0`, never an em-dash) · the client status `onboarding` renders as the i18n label
  **"Draft"** with no schema rename (裁-52) · a past-grace firm renders **read-only** with pay and
  export live and every book-write control disabled-with-reason (裁-55) · BELCORT's operator-exempt
  plan shows full metering and **no invoice** (裁-53) · the invoice renders **every** line 裁-42⑨
  names, from `invoice_lines`, and sums nothing client-side. **Disposition: deferred**, sequenced
  behind billing PR-2 (`get_firm_invoice`) — not a P4 build lane today.

### 2.7 · The shared-file seam

`apps/web/messages/en.json` is touched by all five P4 orders. **Rule (the T0 seam's own, port-wave
plan §3.1):** each order writes **one new top-level namespace** (`Signup`, `Pending`, `Members`,
`Registrations`) and appends to `Admin` **only at its end**, so a conflict is between two orders in
the same alphabetical neighbourhood rather than a whole-file collision.
`apps/web/test/manifest.txt` follows the same rule — alphabetical by directory, then name.

---

## 3 · The P6 trains

裁-9 escalated P6 past the recommendation to **tier (c), full depth**: every built surface re-checked
against the COMPLETE resource set, deviations recorded by ruling and never absorbed. 裁-3 puts
conformance items (fix-as-found) outside P6 and flow polish + identity flourishes inside it.

| # | Train | Carries | Depends on | Size |
|---|---|---|---|---|
| **P6-1** | **`chatTurn_v16` (runtime)** — a new frozen export + registry repoint, emitting the four Q8 parts | 裁-9, Q8 | — | 0.8 |
| **P6-2** | **The card wave (web)** — union 22 → 26, four rich cards, the sweep-card upgrade | 裁-9, 裁-20, 裁-44 placeholder | P6-1 merged | 0.9 |
| **P6-3** | **The a11y + token finish** — target-size gate, the 70% ring + Button treatment, the `--input` re-port, the composited rows | 裁-13, 裁-1, 裁-2 4c, Q7 | P4-2 (the cream ground exists) | 0.8 |
| **P6-4** | **ONE shared signed money input** | 裁-9 flow polish; the Wave-A/C money defects | — | 0.6 |
| **P6-5** | **The agentic surface finish** — ⌘K "Do", amend-resolution, the 7th question kind, the sweep panel, inbox deep-links | 裁-37, 裁-27, 裁-17 | P6-2 (sweep card) | 0.7 |
| **P6-6** | **The identity finish** — mascot, Ledger Fold, the ClaraBook copy pass, the entry-face finish | 裁-14, R1, 裁-3(c) | P4-2, P6-3 | 0.6 |
| **P6-T** | **Track B's frontend home** — the Tax tab, the firm-level deadline feed, the compliance-register line | 裁-34 | F-T1 / F-T2 / F-T3 (§4) | 0.7 |
| **P6-X** | **The cutover PR** — retires `apps/dashboard` | port-wave §8.2 | everything + both exit gates | 0.5 |

**P6-1 and P6-2 are two orders on purpose.** The wire shapes must be **transcribed field for
field** from the frozen closure (`lib/parts/types.ts:104-108`'s own law: *"the runtime is the
declarer, this module is the reader"*), so the web half reads a merged runtime body rather than a
design. Shipping them as one PR would have the reader and the declarer written by the same pass —
exactly the mismatch that law exists to prevent.

**P6-2 also carries the tax-draft card (裁-44) as a NAMED PLACEHOLDER, not a card.** The
`tax_prep` wake body and its needs-you card belong to F-T3's new PR (裁-44's own consequence list);
until that merges, P6-2 records the fifth kind's reserved shape in a comment and ships **nothing**
— a card for a part nothing emits is the same defect as a control for a door that does not exist.

**P6-T is backend-gated and its order says so per surface.** F-T1 PR-1 is built-but-unmerged and
~125 commits behind; F-T3 is unbuilt with PR-7 walled off by 裁-33; F-T2's `statutory_deadlines`
DDL is live-EMPTY at `0139` with **no grant and no verb**. So P6-T's *only* unconditional
deliverable is the **IA**: the `tax` route + tab, the nav entry, the ⌘K rows, and one
`NotBuiltNote` per panel naming its lane — with three ride-alongs, one per backend merge.

---

## 4 · Backend residuals each train depends on, by name

**The house law when a door is absent** (port-wave §7.1 rung 1, minted by the verb census): the
affordance ships as a `NotBuiltNote` **naming the verb and the lane that owes it** — never a fake
control, never a hidden surface, never a disabled button with no explanation. Every note is swept
at P6's exit gate against whether its lane merged (the STALE-NOT-BUILT class).

| Residual | State at `94afbbef` | Blocks | The train's behaviour without it |
|---|---|---|---|
| **F-A5b PR-3** byte-download render worker | unbuilt, no lane; the formal seal chain has never carried a run | the reports download; P6-2's `agent_receipt` link-out for a report receipt | the existing reports NotBuiltNote stands; the card links to the workbench, never to a byte |
| **`clara.list_freeform_reads`** | does not exist (zero hits across 155 migrations) | a browsable freeform-read history; P6-2's `freeform_result` "see all" | the card renders the single result it was handed; no history link |
| **裁-18b PR-3 · `reset_binding_revocation`** | door unbuilt; PR-3 owns its own D1 window | 裁-46's admin control | `vendor-bindings-panel.tsx` names the verb in a NotBuiltNote (§2.6) |
| **G1 producers** (`bank_agent`, `close_prep`, binding-expiry, `tax_prep`) | wake bodies for the first two merged (#437) **with both switches OFF**; the other two unbuilt | anything that renders an agent-initiated receipt on the clock | the cards render when a run exists; the surfaces do not assert one does |
| **Billing PR-1/2/3** | unbuilt; gate closed 裁-50…裁-56 | the whole checkout tranche (§2.6) | deferred — no surface ships |
| **F-T1 / F-T2 / F-T3** | unmerged / DDL-empty / unbuilt | P6-T's three panels | the tab ships with three named NotBuiltNotes |
| **`counterparty_aliases_visible`** | live, granted, **zero readers** (R-2) | T8's alias list + retire dialog, still unmounted | a ~0.2 ride-along; **it will trip three test pins and six stale comments** the audit enumerated |

---

## 5 · The two gates

### 5.1 · P6's ENTRY gate — three acts, none of them a build

1. **The third conformance pass** (裁-9). Passes 1-2 read the PRESCRIPTIVE handoff documents;
   **pass 3 reads the DESCRIPTIVE ones** — the prototype screens and components — as the parity
   reference for every polish lane, **and re-fetches the `clarabook-frontend` repo at P6 entry** so
   any resource added after 2026-08-28 is caught. That second half is a drift check on the *source*,
   not on the port, and it is the half most likely to be skipped.
2. **The ONE agentic-defaults list** (裁-44's standing rule, and the reason it sits at P6): every
   fail-closed default now in force across the estate goes to the owner **in one place** for a
   single *"which of these should Clara be bolder on?"* pass — answered against real data, because
   by then the flows have walked. The conductor assembles it; no lane does.
3. **The P6 build doc.** The alignment audit's own row: *"P6 has spec (§8) but no consolidated
   scope doc; scope accreting."* This plan and its orders companion are that doc's first draft;
   the entry gate ratifies or amends it.

### 5.2 · P6's EXIT gate — four proofs, run by a lane that built none of the trains

1. **The verb-coverage census re-run** at the then-current frontier, by the 2026-08-28 method (a
   throwaway rig, the **live catalog read directly**, never migration-text greps). **Pass = zero
   CUTOVER-OWED and zero un-dispositioned ORPHAN in direction 1; direction 2 still 100%.** It also
   closes §2's 81-vs-87 arithmetic by measurement.
2. **The conformance re-audit** — `routes.ts` re-derived from the live tree (the gate now exists:
   the routes suite), **every `NotBuiltNote`/`NotBuiltBadge` swept** against whether its named lane
   merged (**ten** surfaces carry one today, excluding the three note components themselves and the
   two test files), the manifest count control run as a gate, and R1's Ledger
   Fold + the ClaraBook copy pass confirmed landed.
3. **The a11y set, at four gates not three** — contrast (strict), rule engine, keyboard walk, and
   **target size** (裁-13), with every `--target-min` exception visible and reasoned.
4. **The cutover proof.** Each of `apps/dashboard`'s **61 test suites** classified into exactly one
   of superseded (naming the equivalent) / migrated / retired-with-the-surface / owner-ruling-needed
   — *before* the delete. **A "superseded" that names no equivalent is not evidence.** Inside the
   PR: repoint the proxy and prove the Workers build serves every route **first**, delete the source
   **second** (a rollback after a repoint is a repoint; after a delete it is a restore). Ceremony-
   grade, run from merged `main`, with an as-run record. `app.clarabook.com` serves the OLD
   `apps/dashboard` until this PR lands.

---

## 6 · Open questions — each with this lane's recommendation, none resolved here

1. **The `--input` recut's origin (裁-2 4c).** The ruling puts the recut in the **clarabook**
   repo, with `apps/web` re-porting after it merges. No such PR exists, and P6-3 cannot add the
   four `input-on-*` contrast rows without the value. *Recommend: let **P6-3 set the value in
   `apps/web` and open the clarabook recut PR in the same sitting**, citing 裁-2 4c — the token
   contract stays the record, and the two repos land the same hex. The alternative (block P6-3 on
   an external repo) trades a real gate for a bookkeeping preference.*
2. **The Button focus treatment (裁-1's second half, annex 2 §H.2 ③).** `--ring` and `--primary`
   are the same hex, so a default Button's swapped border against its own fill measures **1.000**;
   no halo alpha fixes it. *Recommend: an **offset ring** (`outline-offset`, so the halo sits
   against the page rather than the fill) over a contrasting border token — one property, no new
   token, and it composites against grounds the gate already measures.*
3. **裁-36's rate wall needs an IP, and the browser cannot be trusted with one.** *"One firm per
   IP per day"* is a DB wall by ruling, but `request_firm_registration` takes no IP argument and a
   client-supplied one is not a wall. *Recommend: **P4-D gets its own short design sitting before
   it is authored** — the honest shapes are (a) a server-only Route Handler couriering the
   proxy-observed address into a new door argument, or (b) the wall living in the edge layer with
   the DB keeping only the per-email half. (a) keeps the DB the wall and is the recommendation;
   either way it is judgement logic and takes review law 1's independent pass.*
4. **The mail courier is the one P4 surface that sends something irreversible.** Design §4 C puts
   it in a server-only Route Handler that calls `invite_member` **as the caller** and mails **only
   on a successful return**. *Recommend: the acceptance test that matters most is the negative —
   **the courier sends no mail when the door refused** — written with a positive control proving
   the mock would have observed a send.*
5. **`app.clarabook.com` still serves `apps/dashboard`, and no repo evidence settles it** (audit
   §5). *Recommend: a deploy-record check as the cutover PR's first act, not an assumption in its
   body — absence of a Workers deployment record is not evidence of a Pages one.*
6. **The main checkout cannot supply `apps/web`'s dependencies, so no P4/P6 lane can verify by the
   standard junction recipe.** Measured this lane: `apps/web/node_modules` does not exist in the
   main checkout, and its store carries `next@15.5.20` (apps/dashboard's pin) with **zero** entries
   for `@base-ui/react`, `cmdk`, `next-intl`, `@opennextjs/cloudflare`, `wrangler` or
   `tw-animate-css`. An empty store — rather than a missing link farm over a full one — means this
   was never installed here. Several lane worktrees carry the whole tree (`next@16.3.3`) in their
   own store, so the frontend lanes have been installing per-worktree throughout. *Recommend: the
   lead names ONE source worktree that P4/P6 lanes junction `apps/web/node_modules` from, or grants
   a scoped `pnpm install --filter @clara/web` per lane. Either is cheap; deciding it per-lane is
   how eleven lanes each spend the same twenty minutes, and how one of them quietly ships without
   running the four verify commands at all.*
7. **Sequencing the cream ground against the 50% ring.** P4-2 grounds four entry faces on
   `--identity-canvas` while the halo is still at `/50`, which fails SC 1.4.11 on that ground
   (2.317 measured, annex 1 §C). *Recommend: **P4-2 adds the ten cream TEXT pairs at 4.5 and NO
   composited focus rows**; P6-3 lands the 70% components and the six composited rows in the same
   PR, in annex 2 §F's order — rule, then change the components, then add the rows. Landing a row
   at an alpha nothing renders asserts a composition that does not ship.*
