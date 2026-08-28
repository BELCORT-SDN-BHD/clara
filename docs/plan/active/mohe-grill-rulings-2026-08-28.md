# 磨合 grill rulings — the 2026-08-27/28 night batch

*The third ruling ledger of the 磨合 window, sibling of
`mohe-grill-rulings-2026-08-27.md` (the opening grill, Q1-Q9 + Q-A…Q-F) and
`mohe-grill-rulings-2026-08-27-evening.md` (R1-R7). Same convention: each entry is the
owner's actual words (kept verbatim where short), what was proposed, and what now binds.
Everything here was ruled in-session on 2026-08-27 evening through 2026-08-28; this file is
the record of record for the batch. Rulings that already landed in a subject document are
cross-referenced, not restated.*

## 裁-1 · Focus-ring alpha + Button treatment — 70%, 按推荐办

**Proposed:** the unified shadcn focus ring (R3 of the evening batch) at **70% alpha** —
the measured floor is 66% (at 65% the accent fails the 3:1 non-text contrast gate at
2.970:1), 70% gives headroom — plus the recommended Button treatment tier.
**Ruled:** "yes,按推荐办". 70% is the bound value; the contrast gate stays the enforcing
instrument (it is unconditionally strict since #367).

## 裁-2 · The entry-face trio (4a/4b/4c) — approved as demoed

Demonstrated live with real `apps/web/app/globals.css` token values (the 进门面三题
artifact), then ruled "yeah可以，没问题，听你的":

- **4a — white card on the identity-canvas** for the entry faces (login/signup/invite):
  the card edge defined by shadow, decorative border only — no new meaning-bearing border
  that would face the contrast gate.
- **4b — the waiting-for-approval page is the FOURTH entry face** and shares the
  identity-canvas ground (R2's original text named only three faces; this extends it by
  explicit ruling, not by drift).
- **4c — the `--input` token recut is APPROVED to initiate**: current `#C7C5BD` never
  reaches 3:1 on any product ground (1.73:1 on white, 1.60:1 on the canvas — a P2-era
  stock issue, not an identity-canvas artifact). The recut lands in the **clarabook**
  repo (design-system home) one step darker; the demo value `#8F8D85` (3.3:1 / 3.1:1) is
  illustrative, the final value is the recut PR's to set. `apps/web` re-ports the token
  after the recut merges.

## 裁-3 · The polish-tier trio — 明白，批准

**Proposed and approved** ("明白,批准."): the three-tier polish model for the built
frontend — (a) **conformance items** (token/contract violations) are fixed as found, never
deferred; (b) **flow-level polish** (motion, transitions, empty/loading states per journey)
batches into the **P6 WHOLE-frontend polish wave** with the four-card wire bump; (c)
**identity flourishes** (Ledger Fold port, ClaraBook copy pass, entry-face treatment) ride
the same P6 wave with the conformance-audit checklist as the closing gate. Nothing built
so far waits on polish to ship; nothing skips the conformance floor.

## 裁-4 · The MCP grounding pair (7a-7d)

- **7a** ("同意"): Mobbin grounding docs bind the port wave's four NEW flows + P4's four
  flows as build-order notes (`p4-mobbin-grounding-2026-08-28.md`,
  `mobbin-grounding-wave-2026-08-28.md`).
- **7b**: the owner connected the **Mobbin MCP and shadcn MCP live** ("我刚刚登陆了mobbin
  mcp…also schadcn mcp also连了"). Standing answer to "did the built frontend miss them":
  the build consumed the vendored shadcn registry + design skills throughout; the live
  MCPs add *reference grounding* (Mobbin) and *registry queries* (shadcn) from P4 onward —
  the two grounding docs are that adoption. No retroactive rebuild is owed; the P6 polish
  wave re-checks built surfaces against the same references.
- **7c**: owner present at the machine for the sitting (recorded for the ceremony log).
- **7d** ("可以, 这个不急对吧? 只是view罢了, 可以进backlog or debts"): the Mobbin
  **flow-video viewing pass** is backlog, not a gate — registered in PROGRESS Backlog.

## 裁-5 · P5 clarified — F-A7b's joint gate, ran EARLY, already CLOSED

The owner asked "P5 呢? 为什么没看到p5?". Clarification of record (not a new ruling): in
the ruled P0-P6 order, **P5 = the F-A7b joint UI+backend design gate**, which was pulled
FORWARD and ran in parallel with P1/P2 — it **closed 2026-08-27 BUILD-AUTHORIZED**
(`fa7b-gate-record.md`). Its build train appears in queues under the name **F-A7b**, which
is why no separate "P5" line exists. Phase accounting: P0-P3 ✓ · P5 (gate) ✓ · P4 build
next · F-A7b build (P5's train) after wave A · P6 last.

## 裁-6 · Port wave = ruling A (recorded at its own docs, cross-referenced here)

"A,不过为什么停牌了？" → ruling A adopted: the **115-name roster, T0 seam PR + 11 trains
across waves A-E**. The plan of record is `port-wave-plan-2026-08-28.md` + `-part2.md`
(merged #379) with the CONDUCTOR ADOPTIONS block; the roster authority is
`verb-coverage-census-2026-08-28.md` (#374). The "停牌" answer: apps/dashboard retires at
the P6 cutover PR, not before the trains re-home its doors.

## 裁-7 · The FULL-PRODUCT assurance frame (standing, re-confirmed twice)

The owner's standing question ("确定is FULL FRONTEND AND FULL PRODUCT RIGHT?") is answered
by the coverage equation + four anti-drift instruments, re-confirmed at this batch:
**250 backend items = 60 wired + 81 port-wave + 24 orphans→journeys + ~79
cited-deliberate + 4 exceptions + 2 stale-notes (fixed #375)**; instruments: (i) every
design doc pairs each backend ask with its frontend home; (ii) the merge-trues-the-note
law (a STALE-NOT-BUILT note is trued by the subject train's merge); (iii) census +
conformance re-runs as P6 exit gates; (iv) the Wave-G estate e2e. New mechanical rule
minted with this batch (lives in `.claude/rules/db-migrations.md`): **any migration adding
a `clara_authenticated` door must name its frontend home or non-UI ruling in the PR
body.**

## 裁-8 · Wave C sequencing — "可以等, 我要完美的的成品"

**Proposed:** Wave C (T1 · T2 · T11) dispatches as one wave AFTER F-A7b PR-a merges, so T11
is built against F-A7b's live doors rather than a guess; the alternative (dispatch T1/T2 now,
T11 later) trades a cleaner calendar for a split wave and a third review cohort while Wave B's
four reviews + P4's final pin round already hold the review capacity.
**Ruled:** wait — the owner values the complete product over the calendar. Conductor's
latitude, recorded so it is not read as drift: T1/T2 carry no F-A7b dependency and MAY be
dispatched the moment Wave B's fix rounds are in same-reviewer re-verify (a capacity
decision, not a dependency one); T11 never precedes F-A7b's merge.

## 裁-9 · P6 polish depth — THE DEEPEST TIER, every provided resource

**Proposed:** tier (b) of 裁-3 for P6 (flow-level polish + the four-card wire bump).
**Ruled (escalated past the recommendation):** "我要最深的, 用我们的所有 design system, token
… rules 和 philosophy, 和我们给与的 design resources, like all skill, mcp we have given …
還有很多我沒有看到的 … 你要去确认一下." Binding from this entry:

- **P6 runs at tier (c), full depth**: every built surface is re-checked screen-by-screen
  against the COMPLETE handoff resource set — the token contract, the design-rule docs, the
  FD-001..FD-047 decision log, EMIL-CRAFT-AUDIT.md, all eight vendored Emil skills, the
  shadcn registry + live shadcn MCP, the Mobbin MCP references, and the high-fidelity
  prototype screens themselves. Deviations are recorded by ruling, never absorbed.
- **A THIRD conformance pass is P6's ENTRY gate, not only its exit gate.** Passes 1-2
  (`clarabook-resource-audit-2026-08-28.md`) read every PRESCRIPTIVE document; pass 3 reads
  the DESCRIPTIVE ones — the prototype screens and components — as the parity reference for
  the polish lanes, AND re-fetches the handoff repo at P6 entry so any resource added after
  2026-08-28 is caught (a drift check on the source, not only on the port).
- The standing answer to "did the port respect the handoff's resources": **yes, with the
  audit's own honest bound** — 1,408 files, every prescriptive one read, provenance
  byte-cited in `apps/web`; the two identity-asset gaps and the one binding-rule delta are
  on file (§3/§4 of the audit) and sit in the owner's 待裁 batch (items 2 and 3). Under this
  ruling their fail-closed defaults ("owed at P6") are the operating assumption until ruled
  otherwise.

## 裁-10 · The beta line — "听你的"

**Proposed and ruled:** an **accounting-correctness defect BLOCKS beta** (a wrong number, a
wrong depreciable base, a mis-attributed posting — the T3 F1 class); a **coverage gap SHIPS
DOCUMENTED** (a `NotBuiltNote` on the surface + a PROGRESS Known-issues row + the Wave-G e2e
record naming it). The owner's follow-up "不过目前都是基本上都可以对吧?" — answer of record at
this batch: nothing merged on `main` is known-broken; every merged train (T0, T3, T6, T5,
T9) cleared an adversarial independent review whose FIX-REQUIRED findings were fixed and
re-verified by the same reviewer; every open item is either in flight (Wave B's four
reviews, P4's final pin round, F-A7b PR-a) or a RECORDED gap — the `counterparty_aliases`
read policy (T8's census), the sweep-receipt acknowledge control (T7's census), and the six
待裁 items. "Basically fine" is true of what is merged; it is not yet true of the product,
which is why the loop continues.

## 裁-11 · `counterparty_aliases` gains its human read policy — "可以，聽你的"

**Context put to the owner (大白话, recorded because the question was "is this an agentic
tool, what does it serve, does it break agentic"):** `clara.counterparty_aliases` (`0011`) is
the DB-owned alias memory the deterministic resolver `_match_counterparty` reads — the
`alias_match` decision in a journal entry's `match_fingerprint` — so Clara recognises "TNB"
as Tenaga without a human coding it twice. Three origins: `former_name` (auto-written by
`rename_counterparty`), `trade_name`, `human` (`add_counterparty_alias`). It is NOT an LLM
tool; the SQL resolver reads it inside `security definer` bodies. The gap T8's rung-0 census
measured via `pg_policy`: the table carries only the owner and `clara_freeform_ro` policies —
`0011` skipped the scoped human read that `.claude/rules/db-migrations.md` makes the default
pair — so no human surface can list an alias, `retire_counterparty_alias` (EXECUTE-granted)
has no reachable id, and the accountant cannot see or retire the memory Clara attributes on.
**Adding the policy touches no agent path**: the definer resolver and the freeform read are
byte-unchanged; RLS still decides who sees what; what it adds is human visibility and
correction over the agent's memory — professional human control, not a weakening.

**Ruled:** ADD it, riding **P4 DB tranche-2**: a `clara_authenticated` SELECT policy + grant
on `clara.counterparty_aliases` that copies the `counterparties` table's own human-read
policy shape verbatim (firm + client scoping, no new predicate). No writer body moves, so
no D1 window; the PR body names **T8's counterparty-hygiene panel** (alias list + the
retire-alias dialog, currently unmounted) as the door's frontend home. T8's wiring lands as
a ride-along after the tranche ceremonies.

## 裁-12 … 裁-21 · The ten-item sitting (2026-08-28, one question per turn, 大白话 each)

*The owner asked for every pending decision explained and decided one by one. Each entry:
what was put, what was ruled, what now binds. Two grounding corrections made during the
sitting are recorded where they bit.*

### 裁-12 · `create_account_set_v1` — RETIRE ("确认退役")

**Grounding correction of record:** the 待裁 sheet had described the door as "建一组会计科目";
it is NOT a chart-of-accounts door. `create_account_set_v1` (`0058`, delta metrics) lets a
human define a **report-metric account set** — a client-level, versioned, frozen-member
grouping of COA accounts with an `effective_from`, consumed by the reporting engine at
evaluation time. The agent version `wake_create_account_set` (`0115`/`0116`) is the path the
product actually walks, and `0116:124` allowlists it for the `interactive` wake kind — a human
directing Clara from the thread redefines a set (new version, rationale + model on the
receipt, `directed_by` recorded) and re-evaluates; issue stays human (F-A5's wall). The
human door has zero callers across the full history and writes no audit row.
**Ruled:** retire — the port wave's fourth named exception. Capability is not lost; if a
human-authored "metric definitions" settings page is ever wanted, it is built as a proper
journey with a receipted door, never by reviving this body. Sets are definitions that bind
BEFORE evaluation; a correction after a draft = a new version + a re-run, never an in-place
edit of the draft (numbers are evaluated, never hand-edited).

### 裁-13 · WCAG 2.2 SC 2.5.8 target-size (24×24) — ADOPT AT P6, with the CI gate

**Ruled:** adopt in the P6 polish wave as a real a11y CI gate (`apps/web/test/a11yRules.ts`),
honouring the token contract's own documented-exception mechanism (`--target-min`; every
dense-table shortfall becomes a visible, reasoned exception, never a silent downgrade). Q7's
formal bar (2.1 AA) is unchanged; 2.5.8 is adopted on top of it. The resource audit's §4 row
moves from OWNER QUESTION to CONSUMED-AT-P6.

### 裁-14 · The Clara mascot — YES, P6, per token contract §7

**Ruled:** port the asset and implement under the contract's rules exactly — empty states and
rare welcome moments only, never a loader, `prefers-reduced-motion` honoured. Resource audit
§3.1 moves from "owed at P6, unruled" to RULED-IN.

### 裁-15 · `security_barrier` estate pass — BEFORE BETA, own PR, all six views

**Ruled:** one PR, sequenced before beta, that sets `security_barrier` on `0137`'s three
masked views (`users_visible`, `firm_open_questions_visible`,
`client_identifier_promotions_visible`) so all six same-shape views carry it (P4's three
already do, #393), with a census cell asserting the reloption AND stating what it does not buy
(nothing for target-list masks). Windowless ceremony (views only, no writer body). Rides the
**pre-beta security-hardening batch** with 裁-16 and 裁-18's wall.

### 裁-16 · Plaintext bearer tokens at rest → hash-only — BEFORE BETA, both instances, one PR

**Ruled:** the invite token in `op_receipts.result` (P4, pinned by cell) and `0002`'s
`firm_admissions.token` are hardened TOGETHER (store the hash, never the plaintext) in one
PR on the pre-beta hardening batch, each with its ceremony. The PR also verifies whether the
`0002` admission path carries an email wall equivalent to `accept_invite`'s (unverified at
the sitting — recorded honestly, not assumed).

### 裁-17 · Seeding proposals — INTO the firm-level needs-you inbox ("要进 firm 级收件箱")

**Context put:** seeding (`0017`: `seeding_batches` / `seeding_proposals` — Clara proposes
`vendor_account_rule` / `counterparty_birth` / `wiki_fact` from a source document; a human
accepts or rejects each) is handled today in T9's SeedingBatchesPanel; `list_review_queue`
emits exactly eight row_kinds and no `seeding_proposal`.
**Ruled:** the inbox row IS wanted. Backend: `list_review_queue` gains a ninth row_kind
`seeding_proposal` (one batch-level row per client with open proposals, linking into the
panel); frontend: a T0-registry affordance entry + the T9 panel as the acting surface. A
pre-beta DB tranche item (the PR body names the needs-you inbox as its home). Also recorded
from the same exchange, P6 flow-polish items (no ruling needed): inbox rows deep-link to the
owning tab/object, not the client-workspace root; a per-row "ask Clara about this" handoff
that carries the row's context into the rail.

### 裁-18 · Vendor identity binding — the signer≠proposer WALL + Clara as PROPOSER, both before beta

**Context put (recorded because the owner's first reaction was "isn't this hardcode / does it
bypass agentic"):** the binding (`0028`, task #36) is not a coding rule and not Clara's KB —
it is the **human-signed authority that lets Clara auto-post** a vendor's invoices without a
human eye: the live `_coding_lane_core` carries `vendor_bound` (→ `ready`) and
`binding_ambiguous` (→ stop and ask) among its 20 reason codes; the fingerprint is
DB-derived, expires ≤12 months, revocable, re-checked at post time (`0029`). It binds
IDENTITY only — account, amount and direction remain Clara's judgement on every document,
and any other reason code still routes her to `needs_you`. The retired rules tier (`0118`,
17 verbs: `coding_rule` / `autopost_rule`) was the thing that substituted for her judgement;
the binding is the thing that extends her autonomy under a professional signature. T10's
review found the UI copy claimed "two-person" while the live signer never reads
`created_by` — the copy is trued in T10's fix round.
**Ruled:** (a) add the DB wall — the signer must not be the proposer — a writer-body change
(D1 window), on the pre-beta hardening batch; (b) build the **Clara proposal door** (a wake
door proposing a binding from her own observation: stable fingerprint, repeatedly approved;
rationale + model on the receipt) so agent-proposes → human-signs is the normal two-party
shape, before beta, its own design gate + backend + frontend train; (c) **strict wall for
solo firms** — a single-admin firm goes Clara-proposes → the human signs; a manual
self-proposal + self-sign is REFUSED with a verbatim message naming the two ways out (let
Clara propose, or add a second admin). Not the "relax when admin_count = 1" variant.

### 裁-19 · `merge_counterparties` re-homes open items + aging consolidates + an UN-MERGE door — before beta

**Context put (T8's review, rig-proven):** the live merge only stamps `merged_into`; the
merged party's open items stay on it, aging keeps listing it under its own name, while new
attribution and statements canonicalise to the survivor — the same money reads differently
in two reports (hard constraint 1). No un-merge door exists.
**Ruled:** a DB follow-up before beta: merge moves the merged party's open items (and their
allocations) to the survivor in the same audited transaction and aging groups by the
canonical party; PLUS an **un-merge door** that reverses a merge (splitting re-homed items and
history back — its own design gate, sized honestly as the larger half). Writer bodies move →
D1 window; full ladder. T8's UI says exactly what the door does at each frontier.

### 裁-20 · The sweep-receipt acknowledge control — P6 four-card batch (confirmed)

**Ruled (confirming the conductor's call):** `SweepReceiptPart` upgrades from an id-only
summary card to a rich card with `get_sweep_run` detail + `acknowledge_sweep_run` inside the
P6 wire bump (`chatTurn_v15`), alongside the other unhydrated part types. No separate train.

### 裁-21 · A firm-level standard Malaysian SME chart of accounts — YES, before beta

**Context put:** `coa_accounts` is per client (`(client_id, account_code)` primary key); the
schema carries NO template mechanism (no template table, no apply door); a brand-new client
with no prior books starts from zero — Clara proposes accounts one at a time
(`wake_upsert_account`, `0121`) and a human confirms; codes drift across clients.
**Ruled:** build it — a **firm-level template** (the firm's standard chart) + an apply door at
onboarding where **Clara trims and proposes by the client's industry (MSIC)** and the human
confirms; the tax-computation layer (F-T3) consumes the same codes. Design gate + backend
train + frontend train, sequenced before beta. Owner's domain call: firm practice starts every
new client from a standard chart.

### The pre-beta queue this sitting minted (for `PROGRESS.md` Next/Backlog)

DB/backend, before beta: P4 tranche-2 (incl. 裁-11) · the hardening batch (裁-15 barrier ×6 ·
裁-16 hash-only tokens ×2 · 裁-18a the signer≠proposer wall) · 裁-17 the ninth row_kind ·
裁-19 merge re-home + un-merge · 裁-18b the Clara binding-proposal door · 裁-21 the COA
template feature · the `create_account_set_v1` retirement (裁-12, rides any of the above).
Frontend, P6: 裁-13 target-size gate · 裁-14 mascot · 裁-20 sweep card · the inbox deep-link +
"ask Clara about this" handoff (裁-17's polish notes). Still a sitting, not a one-word answer:
**the pricing-amounts sitting** (R8c) before P4's UI tranche.
