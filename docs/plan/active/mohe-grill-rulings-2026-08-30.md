# 磨合 grill rulings — 2026-08-30 (the third ledger; continues `mohe-grill-rulings-2026-08-29.md`)

*Same shape as the first two ledgers: one question per turn, 大白话 each, the owner's words where
he gave them, the ruling, the consequences. The 08-28 ledger carries 裁-1 … 裁-28, the 08-29 ledger
裁-29 … 裁-44; this one carries **裁-45 … 裁-56** — the 2026-08-30 noon sitting (12:25–12:50 MYT),
the morning batch that the overnight sprint accumulated: the 裁-41 duplicates route, the 裁-18b
PR-1 review's three questions, G1's two metering questions, and the billing design set's cards.*

*Standing context at the sitting: main `cf912b0f`, repo frontier `0155`, live 148/`0153`;
`0154`/`0155` on main unapplied; G1 wake bodies merged (#437) with both sources OFF.*

## 裁-45 · 0155's live duplicates — "走 Wave G 重置后再上线"

**What was asked.** `0155` (裁-41, the `client_identifiers` UNIQUE) will correctly REFUSE its first
live apply: live ROME SECRETARY holds two duplicate identity groups (`client-identifiers-0049-seed.sql:29-30`),
and the table is append-only with no retire door.

**Ruling — route (a).** ROME SECRETARY is a resettable fixture (constraint 13). `0155` stays on
main and applies AFTER the Wave-G factory reset; no surgical delete, no trigger disable, no
ceremony. *Consequence:* `0155` is NOT in any pre-Wave-G D1 window; the migration ledger notes it.

## 裁-46 · Re-opening a REVOKED vendor binding — "单独一扇管理员门，带理由、受理"

**What was asked.** PR-1 (`0154`) refuses `reset_binding_decline` on a revoked pair
(`binding_revoked_reset_requires_ruling`). May a human re-open a revocation, and by which verb?

**Ruling.** A SEPARATE admin door, `reset_binding_revocation(uuid, text reason)`: admin/owner only,
reason mandatory, receipted. `reset_binding_decline` keeps refusing on revoked — a revocation is a
weightier act than a decline and its undo must carry its own name. *Rides 裁-18b PR-3.*

## 裁-47 · The solo-firm self-sign — "确认：只限 Clara 指示路径"

**What was asked (大白话, after the owner asked "单人公司就不能用了?").** A binding is a
long-lived auto-posting authorisation, so the rule is four eyes: one proposes, another signs. 裁-32
lets a solo firm's only admin sign with an attestation. The question was only WHO supplies the
proposal half: (1) the DIRECTED path — the human tells Clara to bind, Clara runs every wall over the
invoice evidence and proposes, the same human signs with the attestation; or (2) the MANUAL path —
the human hand-writes the proposal and then signs it too.

**Ruling.** Only (1). A solo firm CAN bind vendors — Clara is the second pair of eyes. A human's
own manual propose-then-self-sign is refused regardless of firm size. The 90-day roster window
stands as built (a firm that had a second admin for an afternoon is non-solo for 90 days).

## 裁-48 · The dead 0028 postverify — "退休（删除），单独一个 PR"

`packages/db/deploy/vendor-identity-binding-0028-postverify.sql` probes a body `0118` dropped; it
reds for whoever runs it. **Ruling:** retire it (delete) in its own PR with one line in
`packages/db/README.md`'s deploy contract. The agent does not delete owner-era files without this
ruling; it now has it.

## 裁-49 · G1's two metering questions — "两个都改，搭 G1 PR-2 的 DB 那车"

**Ruling.** `ck_llm_usage_events_call_kind` gains `bank_agent` and `close_prep` (extend-only), and
the two lanes stop borrowing `unattended_posting`; `wake_engine_sources.login_pool` for `close_prep`
is trued to the write pool. Both ride G1 PR-2's DB migration (the producers + the eight deferred
hardening items) — zero extra windows.

## 裁-50 · Billing OQ-1 + OQ-8 — "用 RM，不过先不定价"

**Ruling.** The AI allowance is denominated in **ringgit** through Clara's OWN rate table — never
the USD `llm_price_table` (vendor cost), never an FX derivation. The pricing model and plans are the
ones the owner already gave (裁-28 / 裁-42). **The AMOUNTS stay unset** (`amounts_ruled=false`;
nothing charges) until the owner writes numbers. OQ-8 is therefore deferred by this ruling, not open.

## 裁-51 · Billing OQ-2 — "不铸新角色；付款页给 admin/owner"

No `payments_only` role: the role CHECK stays closed at viewer | bookkeeper | admin | owner. The
billing/payment surface is admin/owner; Stripe's hosted invoice and payment links reach any billing
email without a Clara login.

## 裁-52 · Billing OQ-3 — "不改 schema，界面显示 Draft / 草稿"

The schema status stays `onboarding`; "Draft / 草稿" is an i18n label. No rename migration, no
window.

## 裁-53 · Billing OQ-4 — "豁免，用计划旗帜"

BELCORT is EXEMPT via a plan flag (an operator-exempt plan row): metered in full so the owner sees
real cost, never invoiced, never charged.

## 裁-54 · Billing OQ-5 — "用 Stripe Tax"

SST on Clara's invoices is computed by **Stripe Tax**, configured for Malaysian service tax on the
Stripe side and switched on when BELCORT's own SST registration status (digital-services threshold)
says so; no tax line before registration. F-T1's engine serves the clients' books, not Clara's
invoicing.

## 裁-55 · Billing OQ-6 — "N 天后只读，永不删数据"

Past the grace period (default 14 days, an owner-tunable plan parameter) the firm goes READ-ONLY:
read, export, pay — no book writes. Paying restores. **Accounting data is never deleted for
non-payment.**

## 裁-56 · Billing OQ-7 (archive) — "归档 = 导出包后删除"

**What was asked (大白话, after "archive 不是取消掉这个客户吗？还要收费？").** Archive in the
design was "stop bookkeeping, keep the books read-only for the 7-year statutory retention"; the
question was whether that retention is priced. The owner chose a different meaning.

**Ruling.** **Archive = a complete export package, then DELETE.** No retention fee, no read-only
tail; the 7-year record-keeping duty (Companies Act 2016 / ITA 1967 s.82) returns to the firm with
the package.

**Orchestrator's dissent, recorded then executed.** Deletion is irreversible and crosses the
append-only ledger walls; the door is therefore a REAL audited ceremony, never a status flip.
**Fail-closed defaults under the ruling (INFORM, overrule if wanted):** (1) the export is a sealed
package with a byte-hash receipt (the F-A5 seal + byte-reproduction pattern), and the delete refuses
until an owner-role human confirms the package hash it actually downloaded; (2) a 30-day cooling
window between "archive requested" and the delete, cancellable by any admin; (3) the delete walks
every append-only trigger legitimately through a new audited door, receipted at the firm level with
the package hash — never a trigger disable; (4) BELCORT's operator clients and any client with an
open statutory obligation Clara knows about (an unsettled filing) refuse. **Build: beta-era (P6+),
not pre-beta.** The billing design's "archived = read-only" wording is superseded by this ruling.

---

*Also at the sitting, INFORM only:* the VHDX compaction (admin) is the owner's — it runs when the
runners are idle, the board marks the moment; the hrd-b closed-wave drill's second fix (#438) was
CI-green and awaiting its independent lane's two-polarity verdict.

---

## Evening sitting (2026-08-30, ~20:10 MYT onward) — 裁-57 … 裁-72

### 裁-57 · Beta is a PAID launch — no invited-free tier

**What was asked.** Whether the invite-first onboarding model implies a free tier ahead of Stripe
payment.

**Ruling.** **Beta is a PAID launch. There is no invited-free tier.** "基本没有邀请免费这种东西,
只有signup 然后付费stripe开始自己的firm, 我的邀请意思应该是可以邀请别人来做自己的bookkeeper or
admin or any RBAC we designed in his/her firm." 裁-43 stands verbatim (tier-3 self-serve: sign up,
pay through Stripe, start; no approval queue). "Invite" in every earlier ruling means RBAC
membership invites INTO a paying firm (P4-1/P4-4), never free access. *Consequence:* the billing
checkout tranche (Stripe Checkout + webhooks + plan flag + invoice/receipt surface +
`amounts_ruled`) is ON the beta critical path, and the amounts (裁-50 left them unset) must be
ruled before launch. Recorded by the orchestrator; census question 55(a) / FE OQ-0 CLOSED.

### 裁-58 · THE AMOUNTS at beta — RM0, free until the pricing sitting

*A first click at this sitting proposed a dedicated PRICING SITTING before Wave G, with the
checkout tranche built now as DB-owned rate-table rows and `amounts_ruled` flipping at that
sitting — superseded by a mis-click before the owner confirmed it. The ruling below is FINAL.*

**Ruling — FINAL.** "RM0，免费到定价." Every plan is FREE until the amounts are ruled: checkout
runs in Stripe subscription mode with a free-trial/zero-amount price (card collected, nothing
charged — Stripe permits zero-amount subscription charges; MYR's non-zero minimum is RM2.00, so
"RM1" was never possible); the UI renders "Beta 试用期 / trial" — NEVER "RM0" (裁-42's design wall
stands); `amounts_ruled=false` and `issue_invoice` refuses until the pricing sitting (date: the
owner's, before or after launch). Plans + the business model (裁-43, 裁-50–56) are confirmed
ruled; only the numbers wait.

**Orchestrator's dissent, recorded then executed.** The real-money charge path is not exercised
before launch. *Mitigation:* Wave G walks checkout in Stripe TEST mode with a non-zero test price
and test cards, so the charge/webhook/invoice path is proven without real money.

### 裁-59 · Wave G's criterion — the agentic product, three switches, tax_prep separates

**Ruling.** **Wave G's criterion is the agentic product: the `bank_agent` + `close_prep`
PRODUCERS (G1 PR-2a/2b) and the binding-expiry sweep are Wave-G PRECONDITIONS; THREE switches
open at the G1 ceremony (`bank_agent` · `close_prep` · binding-expiry).** `tax_prep` gets its OWN
later sitting whose act list is fixed "deploy the evaluator FIRST, then the switch." 裁-40 is not
amended; only tax_prep's date separates. Census 55(d)/58 and tax OQ-D CLOSED.

### 裁-60 · The P6 cutover is pulled forward onto the beta critical path

**Ruling.** The retiring `apps/dashboard` is NOT touched; **the P6 cutover (apps/web on Workers +
`app.clarabook.com` DNS switch) is PULLED FORWARD onto the beta critical path** — it lands as soon
as P6-2's four cards render, and no beta user is pointed at the old domain before it. Census 55(c)
CLOSED (the four "Unsupported part" chips die with the old app).

### 裁-61 · `/ready`'s storage write probe becomes a hard readiness failure

**Ruling.** **`/ready`'s storage write probe becomes a HARD readiness failure before beta**
(`health.mjs` ~302-316: a failed storage write → `ready:false`; a small runtime PR under the full
ladder; a short consecutive-failure tolerance is the builder's call, recorded in the PR). Census
55(e) CLOSED.

### 裁-62 · Beta ships NO issued tax artifacts — the tax module is inert at launch

**Ruling.** **Beta ships NO issued tax artifacts.** "beta 先不出正式税务文件" — F-T3 PR-7
(artifacts/issue) stays HELD; the golden-bar YA (F-T3 OQ-1 / MBB-2), the treatment-code signature
(OQ-7) and the tax lead (OQ-8) are ruled AFTER beta.

**INFORM recorded for the owner.** With the 13 treatment codes UNSIGNED every treatment refuses
`treatment_code_unsigned`, so Clara cannot even DRAFT a computation at beta — the tax module is
inert at launch (consistent with 裁-59: `tax_prep` is not among the three switches).
*Consequence for the sprint:* F-T3 PR-2…PR-6 and PR-9 leave the beta critical path (they may keep
building in parallel, non-blocking); P6's Tax tab renders the law tables + "not yet signed" state
only.

### 裁-63 · Wave G's acceptance evidence is the desktop corpus, final — MBB-1 CLOSED

**Ruling.** **Wave G's acceptance is "every flow and every feature walks end-to-end" on the corpus
already on the desktop — there is NO further owner evidence coming.** "我有的就是desktop那些而已,
没了, 我只是来e2e所有flow and features 走得通而已." MBB-1's items (BEE GL/TB, RPR Feb/Mar-2025
statements, producer/certifier names) are marked "资料缺失" in the acceptance record, never
awaited; the RPR overlapping-series pick is the AGENT's by measurement (the series that covers
Apr–Jul exactly once; recorded in the as-run). The F-T3 golden bar (裁-62) is likewise not a
Wave-G item. MBB-1 CLOSED.

### 裁-64 · FE plan OQ-1/2/3/7 — all four recommendations accepted

**Ruling.** ① 裁-36's registration rate wall gets a short design sitting before P4-D (server-only
courier passes the proxy-observed address; the DB stays the wall); ② the `--input` recut value is
set in this repo by P6-3, which opens the clarabook-frontend PR in the same sitting; ③ Button
focus = an OFFSET ring (`--ring` ≡ `--primary` hex); ④ P4-2 adds the ten cream TEXT pairs only;
P6-3 lands the 70% alpha + the six composited rows together.

### 裁-65 · P4-4 review trio — the P4-7 magiclink arm, the refusal sentence, Resend hardening

**Ruling.** ① **BUILD the existing-account accept arm NOW** — a new stacked train **P4-7** on top
of P4-4: when `canMintFor` says `already_registered`, the courier mints a Supabase MAGICLINK (not
an invite) carrying the same `?ct=` Clara token; the accept route gains a second arm (`verifyOtp`
type `magiclink` → subject bound → `accept_invite(ct)`); the DB wall (one active membership per
user) still refuses until the person's previous firm removed them — the refusal is rendered
honestly. P4-4 itself keeps the fail-closed 409 until P4-7 lands. ② the fixed refusal sentence
stands (bounded admin+ enumeration accepted, audited). ③ beta mitigates the two-secret mail with
Resend hardening (message storage OFF · `sending_access` domain-restricted key · restricted team
log access — Wave-G checklist); the single-secret redesign is a P4-D design item.

### 裁-66 · 裁-48 REVERSED on the corrected premise — the 0028 postverify is KEPT

**Ruling.** **裁-48 REVERSED on the corrected premise:
`packages/db/deploy/vendor-identity-binding-0028-postverify.sql` is KEPT** (a live, passing 12/12
instrument at the 0155 frontier, made succession-aware by #433); PR #440 is CLOSED unmerged, its
branch deleted. The lesson stands in memory: a claim about what a script DOES needs a run, not a
header comment.

### 裁-67 · 0155 deploys to live AFTER the Wave-G factory reset

**Ruling.** **0155 (裁-41 identifier-unique) deploys to live AFTER the Wave-G factory reset** —
ROME SECRETARY's "four rows for two values" duplicates are a resettable fixture (constraint 13)
and vanish with the reset; no surgical delete, no trigger touched. Owner-batch item 48 CLOSED.

### 裁-68 · The tier-3 self-serve gate — exactly three walls + payment

**Ruling.** **The tier-3 self-serve gate = exactly three walls + payment:** ① DPA e-sign at
signup (the `docs/ops/legal/` text, owner-confirmed once); ② 裁-36's rate wall (1 firm / 1 email /
1 IP; design sitting per 裁-64); ③ 裁-26's email-bound admission token; and **Stripe checkout
success IS the approval** — no operator queue for tier-3 (裁-43 stands). One billing/signup train
wires the three onto the signup page. Item 22 CLOSED.

### 裁-69 · Agent proposal bases carry DB-resolved citations — one contract for both doors

**Ruling.** **Agent proposal BASES carry DB-RESOLVED citations, before beta, as ONE contract for
BOTH doors** (`client_identifier_promotions` 0103 + F-A7b's `wake_propose_client_onboarding`):
each citation must resolve to a `witness_citation_regions` row of the triggering document;
`sightings` is derived by the DB from the rows, never accepted from the model; the needs-you card
renders the resolved regions. One small migration pair (backend → Codex) + the card; one D1 window
batched with the next. Item 1 CLOSED.

### 裁-70 · IA for the tax family in apps/web

**Ruling.** A client-page **"Tax" tab** (F-T1 SST + F-T3, which at beta renders the "treatment
codes unsigned — preview" state per 裁-62); the statutory-deadline calendar (F-T2) is a
**firm-level needs-you feed + one firm page**. One named PROGRESS row; F-T2's old-app page retires
with it. Item 24 (P-5) CLOSED.

### 裁-71 · Ten delegation defaults confirmed as rulings

**Ruling.** ① the binding-expiry sweep source opens at the G1 ceremony with `bank_agent` +
`close_prep` (three rows, one ceremony; O4/item 34); ② a client with no recorded SSM/TIN gets NO
vendor-binding proposal — `binding_client_identity_unproven` stands (46e); ③ `bank_agent` cadence
1 h (item 62); ④ PRD §8's "Billing (deferred)" non-goal row becomes a scope note "amounts only"
(55b); ⑤ tax: weekly cadence tightening inside the filing window, three sources on one engine,
admin+ settles (OQ-B/C/E — all post-beta per 裁-62); ⑥ T11 N2: "Amend resolution" on a resolved
onboarding item ships as a P6 polish item (item 10); ⑦ ⌘K "Do" = light Do behind the live
allowlist, P6 scope (P-1/item 23); ⑧ R9(c) storage-role re-examination after beta (item 25); ⑨ the
two small DB items ride the next DB pass (`ck_llm_usage_events_call_kind` + `bank_agent`/
`close_prep`; `wake_engine_sources.login_pool` trued — 47a/b); ⑩ three backend backlogs go to
PROGRESS Known issues (0123's `firm_egress_dispatch_authorizations` owned by postgres;
`bank_agent_due_claims` has no retention path; the wake allowlist is name-bound not
signature-bound — items 76/77/3).

### 裁-72 · The P6 cutover scope — ALL 110 verbs get an apps/web home before the switch

**What was asked.** The verb-coverage census found 81 CUTOVER-OWED verbs (wired only in the
retiring `apps/dashboard`) and 29 ORPHANS (no UI anywhere at all, headlined by "nothing can open
a fiscal year"). Does the P6 cutover need every one of the 110 ported before the domain switch, or
can it go with the 81 alone (dashboard-behind-admin-flag or named Known-issues deferrals for the
rest)?

**Ruling.** **The P6 cutover scope is ALL 110 verbs** — the 81 CUTOVER-OWED and the 29 ORPHANS
both get an `apps/web` home BEFORE the domain switch. "110 个全接完再切." Verb-coverage census
(`docs/plan/active/verb-coverage-census-2026-08-28.md`) dispositions 1+2 CLOSED.

**Orchestrator's dissent, recorded then executed** (cost: ~8+ frontend trains, beta moves by
weeks). *Execution:* the work is organised as domain trains **P6-C1…C7** in criticality order
(fiscal-year/close cluster → firm admin/onboarding/egress → journals/governance/coding →
opening/carry-down → counterparty/documents/questions → fixed assets/depreciation + staff
advances → adjustments + reports/sweeps/seeding), each shipping dated NotBuilt cards for the
verbs still ahead of it so the product stays honest mid-programme. **裁-60's "cutover as soon as
P6-2 renders" becomes "cutover when C7 lands."** `requeue_render_job`'s possible P3 scope-down
(disposition 3) is reconciled inside C7.

### Closed without a new number (already ruled or superseded)

- 46(b) solo attestation = 裁-47 (Clara-directed path only)
- 46(c) = 裁-66
- 36 = 裁-41 (merged 0155)
- 12 = 0148 (merged)
- 40(a) = #447 kind wall
- 13 (18a before 18b) = done
- 15 (email-bound admission token) = 裁-26
- 43 Codex token = resolved
- 44 VHDX = owner at the keyboard tonight
