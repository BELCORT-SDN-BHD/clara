# The PORT WAVE plan — part 2: ladder, wire bump, cutover, effort, open questions

*Companion to `port-wave-plan-2026-08-28.md` (§1 scope · §2 the 115-name roster · §3 the
four shared-file seams · §4 the train partition · §5 agentic presentation · §6 ordering).
Same lane, same date, same grounding. Plan only — no build.*

---

## 7 · The ladder, per train

Review intensity is **uniform** (ADR-061): every train touches code, so every train takes
the full ladder. Nothing below is optional and nothing is tiered by train size — T5 (7 doors)
walks the same rungs as T3 (14).

### 7.0 · Rung 0 — the verb census at the LIVE bodies

**Before a line is written.** Every train opens by censusing its own doors at the live
catalog, not at migration text — `apps/web/AGENTS.md:20-21` states the rule: *"A migration
citation must chase the LIVE body (a later `CREATE OR REPLACE`, a dynamic splice) — never
cite a migration's first `CREATE` without checking what superseded it."* The P3 fold's own
measured result is why this is rung 0 rather than a review item: **zero wrong-verb defects
across five lanes**, and the 2026-08-28 census then confirmed 85/85 of P3's wiring resolves
at the live frontier.

Per train the census records, for each of its doors: the exact argument names and types at
the live body · the return shape · the refusal codes it can raise · which grant a firm
session actually holds. A door whose census comes back different from this plan's assumption
is a **scope note**, not a redesign — T4's `adjustment_run_due` and T8's `apply_open_items` /
`unallocate_group` are the two this plan already expects to move (OQ-4).

### 7.1 · Rungs 1-5 — Q9's per-journey DONE formula, verbatim

> *"Per-journey DONE = **(1)** screens built against LIVE verbs — no affordance without a
> named backend verb · **(2)** hydrate-never-trust throughout, no optimistic UI · **(3)** the
> three a11y CI gates green · **(4)** an impeccable/Emil polish pass · **(5)** an end-to-end
> walk on live test data (ADR-0075). Cross-cutting: every crude door replaced IN PLACE, same
> verb, no new gate; the UI never invents a number, verb, receipt or link."*

Applied to this wave, rung by rung:

**(1) Built against live verbs.** Rung 0's census is the evidence. Any affordance a train
wants but cannot name a verb for ships as a `NotBuiltNote` **naming the verb and the train**
— the census's minted law, now also T0's tab-placeholder mechanism.

**(2) Hydrate-never-trust.** Reads ride `getRows`; governed writes ride `callDoor`; a
`DoorRefusal` renders verbatim and is never retried; every caller re-reads after every act
(`apps/web/AGENTS.md:6-10`). The shared `useHydratedPart` hook's `act()` already reloads on
success *and* failure with a sticky refusal — trains use it rather than re-deriving it.
**No optimistic UI, ever.** For this wave specifically: no train computes a total, a tie-out
result, or a "will this merge succeed" prediction — the DB owns every one of those.

**(3) The three a11y CI gates.** They already exist and ride `lint` / `test`, not a separate
CI step: token contrast (`apps/web/scripts/check-token-contrast.mjs`, unconditionally strict
since #367) · the a11y rule engine (`apps/web/test/a11yRules.ts`) · the keyboard walk
(`apps/web/test/keyboardWalk.ts`). **Extension expected per train** — §7.2.

**(4) Polish pass.** The vendored Emil/impeccable skills, per surface. R3's unified shadcn
3px focus ring and R4's two philosophy substitutions (**StateBanner over Toast, prose state
copy over skeletons**) are house state law and bind every new surface.

**(5) Live-data walk.** On the real estate under ADR-0075/constraint 13 — every non-BELCORT
firm is a resettable test fixture. Two trains need this rung more than the others: **T1**
(nothing has ever opened a fiscal year) and **T9** (the snapshot registry has never carried a
run). For those two the walk is not a confirmation, it is the first execution.

### 7.2 · Rung 6 — the battery, and what each train owes it

**Every new surface owes an a11y test file. Every surface that carries a governed act also
owes a keyboard-walk file.** The P3 precedent is exact: `documents-a11y`, `journals-a11y`,
`journals-keyboard`, `close-a11y`, `close-keyboard`, `bank-a11y`, `needs-you-a11y`.

The wave's specific expectations:

| Owed by | Battery addition |
|---|---|
| Every train | its own `lib/<domain>` door-wrapper tests (wire-shape pinning: exact verb name, exact argument names, exact refusal passthrough) |
| Every train with a new panel | a `*-a11y.test.tsx` for that panel |
| Every train with a door dialog | a `*-keyboard.test.tsx` — a dialog is the highest-risk keyboard surface in the product |
| T2, T7, T8, T11 (new surfaces) | both, plus the contrast gate re-derived if the surface introduces a new token pair |
| T0 | the test-manifest count-control gate itself, with a **positive control** — a deliberately unlisted test file must make CI red, proven, not asserted |

**The keyboard gate earns its own sentence.** The P3 workbench lesson records that a keyboard
gate found **six permanently-unopenable doors that five code reviews missed** — a different
instrument, not another reader. Eleven trains shipping door dialogs is exactly the population
that produced those six.

**Contrast gate note (R2 × R3).** R3 unified focus indicators on the shadcn 3px translucent
ring and directs the contrast gate to re-derive focus-ring pairs as the ring's **composited
effective colour**, including on R2's cream `--identity-canvas` ground. R2's ground is
entry-pages-only, and no port-wave train builds an entry page — so the R2×R3 collision R3
reserves to the owner **cannot be triggered by this wave**. Recorded so a train does not go
looking for it.

### 7.3 · Rungs 7-9 — review, fix, re-verify

**(7) Independent review**, fresh context, pinned model (`claude-opus-5` xhigh for a train
that carries governance logic; `gpt-5.6-sol` direct-exec where the Codex lane is available —
never blocking on it, per the standing availability ruling). Review law 1's floor: a PR that
changes judgement logic gets an independent pass. **Every train in this wave changes
judgement logic** — a refusal branch, a disabled-vs-hidden affordance decision, a
row-kind dispatch — so this is not a per-train judgement call.

**(8) The fix round is itself judgement logic.** The P3 workbench lesson is blunt about this:
two lanes' fix rounds introduced regressions, and the same-reviewer verification rung caught
both. A train's fix round is not done when the fixes are written.

**(9) Same-reviewer re-verification to CLEAR.** The reviewer who raised the findings verifies
the fixes, in the same context. A new reviewer verifies nothing about a fix they did not
raise.

### 7.4 · The fold

Each wave (A, B, C) folds as a unit before the next forks, with:
- **own-delta attribution per branch** — a fold review that reads the union diff attributes
  nothing correctly; each branch's own delta is reviewed against its own baseline
  (`--cc` on the merges), the P2 fold lesson's rule.
- **the test-count control** — after every fold, the manifest count is re-derived from disk
  and compared. §3.1 of part 1 exists so this check can be mechanical rather than vigilant.
- **later-branch gate truing** — a gate a train wrote to pin a defect a *sibling* later fixed
  must flip. The P3 fold lesson names this class; with eleven trains it will occur.

---

## 8 · The P6 wire bump and the cutover PR

### 8.1 · The four-part wire bump — *size 0.6*

Q8, verbatim: chat wire adds **exactly four** part types in **a single** runtime version bump
(chatTurn_v15 era) — `agent_receipt` (generic, reads `agent_receipts_visible`) ·
`firm_question` (resolve/dismiss doors) · `close_proposal` · `freeform_result`. Live/working
state renders at the SSE layer, **not** as a persisted part type. Catalog total: 18 live + 4
= **22**.

Mechanically this touches the three files the P2 parts lane built and the compile-time guard
already protects: the union in `apps/web/lib/parts/types.ts`, the registry in
`apps/web/lib/parts/catalog.ts`, and the render chain in
`apps/web/components/parts/PartRenderer.tsx`. The `AllCovered`/`NoExtra` exhaustiveness
guards make a missing catalog entry a `tsc` failure and the runtime parity test makes a
missing render branch a test failure — so the mechanism enforces its own completeness. Plus
the runtime side: a **new `chatTurn_v15` export**, never an edit to `chatTurn_v14`'s body
(hard constraint 9, freeze-lint enforced), and the registry repointed.

**Why it runs after Wave C, not before.** Three of the four parts have a workbench half in
T1 (`close_proposal`, `agent_receipt`) and T7 (`firm_question`), and Q8's design is
workbench-first on zero wire change. Shipping the card before the workbench would mean a card
whose "open the full object" destination does not exist.

**Deploy note.** A runtime version bump is a ceremony from merged `main`, and the standing
lesson applies: after deploy, prove the serving bundle by an **in-VM bundle grep** for
`chatTurn: chatTurn_v15`, never by the deploy's own success. `PROGRESS.md` records the
2026-08-26 case where the tag was assumed and the bundle was still on v13.

### 8.2 · The cutover PR — *size 0.5, ceremony-grade*

The base handoff §9.5 defines it: *"The cutover PR retires `apps/dashboard` and the
Cloudflare Pages deployment, repoints the proxy to the Workers build, and moves the dashboard
suite's coverage onto apps/web equivalents. Ceremony-grade: run it from merged `main`, never
from a branch, and write the as-run record."*

Measured scope on this branch's tip: **`apps/dashboard` is 217 TypeScript files, of which 61
are test files.** The handoff's §10.6 flags the disposition of those 61 as **UNVERIFIED** —
*"§9.5 states the intent; no repo text ratifies the disposition of each suite"* — and ruling
A does not settle it either. **This plan makes it an explicit PR deliverable rather than an
assumption**: before the delete, each of the 61 suites is classified into exactly one of

1. **superseded** — an apps/web equivalent exists and covers the same behaviour (name it),
2. **migrated** — no equivalent exists; the suite moves to apps/web in this PR,
3. **retired with the surface** — it tested a door whose only home was the dashboard and
   which ruling A did not port (expected: near-zero, since ruling A ports everything), or
4. **owner ruling needed** — it tests something neither app covers.

A classification of "superseded" that names no equivalent is not evidence — that is review
law 2 applied to the one place in this wave where deleting 61 files is the action.

**Sequencing inside the PR.** The proxy repoint and the Pages retirement are separable from
the source delete and should not ride the same commit: repoint first, prove the Workers
build serves every route, *then* delete. A rollback after a delete is a restore; a rollback
after a repoint is a repoint.

---

## 9 · Exit gates

Two gates, both in Wave E, both run by a lane that built none of the trains.

### 9.1 · The census re-run

A fresh two-way verb-coverage census at the then-current frontier, by the same method the
2026-08-28 run used: a throwaway rig, the **live catalog read directly** (never
migration-text greps — the census's own note is that revokes make text unreliable), a
coordinating lane plus domain lanes, every orphan claim spot-verified against review laws
2 and 3.

**Pass condition:** direction 1 shows **zero** CUTOVER-OWED and **zero** un-dispositioned
ORPHAN. Every function in the granted surface is UI-wired, deliberately non-UI with a
citation, or excepted by a recorded owner ruling. Direction 2 stays at 100% — no stale wiring.

**It also reconciles §2's arithmetic.** The 81-vs-87 gap is closed by measurement, not by
argument, and the result is recorded either way.

### 9.2 · The conformance re-audit

Not a repeat of the census — a different instrument, aimed at the claims the wave itself
made:

- **`routes.ts` re-derived from the live `apps/web/app/` tree.** Every `status: "built" | "planned"`
  checked against whether a `page.tsx` exists at that path. The file's own header asks for
  this (`apps/web/lib/command/routes.ts:21`) and §3.6 of part 1 makes it a wave law.
- **Every `NotBuiltNote` and `NotBuiltBadge` swept.** Each names a verb and a train; each is
  checked against whether that train merged. This is the STALE-NOT-BUILT class the census
  minted, and eleven trains is the largest population of dated claims the product has ever
  carried at once.
- **The test manifest count control**, run as a gate rather than trusted as a habit.
- **The ClaraBook handoff conformance re-audit** — R1's Ledger Fold asset port and the
  ClaraBook product-name copy pass are recorded as owed **pre-P6**; the audit confirms both
  landed and that the R3 focus-ring pass covers every new surface.

### 9.3 · What "the wave completes" means

Both gates green, the wire bump deployed and bundle-proven, and the cutover PR's as-run
record written. Only then does `apps/dashboard` stop existing, and only then does
`PROGRESS.md`'s posture change.

---

## 10 · Effort, sizing and dependencies

### 10.1 · Effort in P3-lane equivalents

| Item | Size | Doors |
|---|---:|---:|
| T0 seam | 0.3 | 0 |
| T1 close + fiscal year | 1.0 | 9 |
| T2 opening & carry-down | 1.3 | 11 |
| T3 fixed assets & depreciation | 1.2 | 14 |
| T4 adjustments, templates & accounts | 1.0 | 12 |
| T5 staff advances | 0.5 | 7 |
| T6 drafts & document governance | 0.8 | 9 |
| T7 coding, questions & quality signals | 1.2 | 14 |
| T8 AR/AP statements & counterparty | 0.9 | 10 |
| T9 reports authoring, snapshots & seeding | 1.0 | 9 |
| T10 firm admin: bindings, compliance, sharing | 0.9 | 9 |
| T11 client onboarding five | 0.7 | 5 |
| **Trains subtotal** | **10.8** | **109** |
| P6 four-part wire bump | 0.6 | — |
| The cutover PR | 0.5 | — |
| Exit gates (census re-run + conformance re-audit) | 0.4 | — |
| **Total** | **≈ 12.3 P3-lane equivalents** | **109** |

**The calibration, stated so it can be checked.** One P3-lane equivalent is measured against
what P3 actually produced on this branch: bank 43 files / 4,813 lines · documents 33 / 4,246
· journals 20 / 3,163 · close+reports 26 / 3,565 · firm+registers+knowledge 37 / 3,419 —
each through census → build → independent review → fix → re-verify. So 1.0 ≈ 20-40 files,
~3,000-4,500 lines, ~10-14 doors, full ladder.

**Wall-clock, as an extrapolation and labelled as one.** P3 ran five concurrent lanes and
merged P1 through P3 inside the 磨合 window that opened 2026-08-26/27, with P3 completing
2026-08-27. At four concurrent lanes per wave and three build waves plus D and E, the
extrapolation is **roughly 4-6 working days of wall-clock**. That is derived from one
observation of one wave and should be treated as a planning figure, not a commitment — the
honest uncertainty is in T2 and T11, the two trains with genuinely new surfaces and external
dependencies.

**Where the cost concentrates.** Four trains (T2, T3, T7 and T4) carry 47 of the 109 doors
and all three of the wave's largest new surfaces. If the wave has to shed scope, it sheds
nowhere useful — ruling A is port-all — but it can *resequence*: T5, T6 and T9 are the three
cheapest and could ride as a single combined lane if worker supply is short.

### 10.2 · Dependencies

| Dependency | Blocks | State | Handling |
|---|---|---|---|
| **T0 seam PR merged** | every train | not started | hard gate; nothing forks first |
| **web/stale-notes-truing** | T1 | in flight, per the census wiring 4 of T1's 9 doors | T1 re-censuses at that lane's merged tip and scopes to the remainder (OQ-1) |
| **F-A7b ruled playbook states** | T2 (design input) | `fa7b-gate-record.md` closed 2026-08-27 | already available; read as a design input, no code dependency |
| **F-A7b build train** | T11 (hard) | gate closed BUILD-AUTHORIZED; train not built | T11 sequenced last; fallback in OQ-3 |
| **P4 members page** | `users_visible` | P4 design in review on branch web/p4-design | routed out of this wave; T10 must not build a second surface |
| **P4 settings** | `set_firm_high_stakes_threshold` | same | routed out |
| **P4 firm creation** | `create_firm` | same | routed out; P4 extracts `_create_firm_core` |
| **T1 + T7 workbench halves** | the P6 wire bump | this wave | Wave D runs after Wave C |
| **Every train + both exit gates** | the cutover PR | this wave | Wave E |
| **Mobbin grounding** | T2, T7, T8, T11 | owed, currently unmet (§13) | one grounding lane, ahead of Wave C |

**No backend dependency exists.** Every one of the 109 doors is live at `0138` and measured
so by the census. No train owes a migration, and no train may write one — a train that thinks
it needs a backend change has found a census error and should stop and report it.

---

## 11 · Non-goals

- **No redesign.** Trains extend proven surfaces under existing house laws. A train that
  wants to restructure a P3 surface raises it rather than doing it.
- **No new part types beyond Q8's four.** The catalog goes 18 → 22 and stops. A train that
  wants a fifth has found a P6 scope question, not a build task.
- **No `apps/dashboard` feature work.** It is being retired; nothing is added to it.
- **No mobile surfaces.** Q6's mobile decision corridor (needs-you · Clara threads ·
  receipts read · reserved human-act doors) is unchanged by this wave; no train builds a
  dedicated mobile bookkeeping screen.
- **No pricing amounts.** Q-E's pricing sitting is P4's, before P4, and this wave does not
  touch it.
- **No dark theme.** Light-theme-only is a beta-scope ruling (Q4) and `dark:` is banned
  (`apps/web/AGENTS.md:16-17`).
- **No weakening of a security mechanism for testing convenience** — constraint 14's
  operative clause. The client-switch security event, the session accessor singleton, and the
  two-lane wire are untouched by every train.

---

## 12 · Open questions, each with a recommendation

**OQ-1 — web/stale-notes-truing overlaps T1 by four doors.** The census records that lane
as wiring the `0138` four (`hold_close_prep`, `release_close_prep`, `list_agent_act_receipts`,
`settle_close_proposal`) and truing the close note, which is 4 of T1's 9.
*Recommendation:* let it land on its own ladder first — it is smaller, in flight, and closes
a STALE-NOT-BUILT finding. T1 forks from its merged tip and re-censuses; whatever it already
wired, T1 verifies rather than rebuilds. **Do not** pause it to fold into T1: that would park
a false claim on `main` for the length of a wave.

**OQ-2 — the 81-vs-87 arithmetic.** The census's headline count and its own domain lists
differ by six names, most likely the seven double-tagged RULING adjustment reads.
*Recommendation:* no re-ruling. Work the 115 names (§2 of part 1), and let the exit-gate
re-run close the gap by measurement. Recorded here so a later reader does not think the
discrepancy went unnoticed.

**OQ-3 — T11's fallback if the F-A7b build train slips.** T11 is the wave's only hard
external dependency, and the cutover PR cannot ship with five doors unported.
*Recommendation:* if F-A7b has not built by the start of Wave C, T11 ships the **checklist
card and the five doors' affordances against the live verbs that already exist**, with a
`NotBuiltNote` naming precisely what F-A7b's train still owes. That is honest, unblocks the
cutover, and is exactly the mechanism the house already uses. It does **not** mean shipping
a wizard — R7 superseded those pages and that ruling stands regardless of timing.

**OQ-4 — `apply_open_items` and `unallocate_group` are placed on judgement.** The census
records them as existing *only* inside refusal/remedy text. This plan reads them as AR/AP
allocation verbs and puts them in T8. *Recommendation:* T8's rung-0 census confirms at the
live body **before** building. If they turn out to be bank-settlement verbs, they re-home to
a small bank ride-along — a recorded scope move, not a re-plan. Flagged because "the remedy
text says use this door" is the weakest provenance of any door in the wave.

**OQ-5 — is `create_account_set_v1` a port or a retirement?** The census calls it *"the human
body F-A5's agent core was derived FROM, never wired."* Porting a body that a live agent core
supersedes would build a surface for something already superseded — the same shape as the
`get_journal_entry` single-arg exception the owner already took.
*Recommendation:* T9 censuses it first and reports; if the agent core fully covers it, it is
a **retirement candidate**, and the owner takes a fourth exception rather than the wave
building a dead surface. Do not build it on the assumption that ruling A forces it — ruling A
says every *userflow* lives in the agentic UI, and a superseded body is not a userflow.

**OQ-6 — does the wave light ⌘K "Do"?** Today Do is a fixed, disabled, single row that names
its own shape and dispatches nothing. After this wave the door roster is complete for the
first time, which is the natural moment to make Do live.
*Recommendation:* keep Do inert through all eleven trains, and light it in the **P6 global
polish PR** against the finished roster. One change with one review beats eleven trains each
nudging the same file — and it keeps the palette out of §3's hotspot list.

**OQ-7 — `set_client_fy_end`'s home.** Placed in T1 (the fiscal-year opener's precondition)
rather than a client-settings surface, which does not exist and which this wave has no other
reason to create. *Recommendation:* T1. If P4's settings work later creates such a surface,
moving one door is cheap; creating a surface for one door now is not.

---

## 13 · The Mobbin grounding debt

The house rule — *"ground every NEW product flow in a Mobbin reference first"* — is recorded
as R5, which put the Mobbin MCP into the repo's `.mcp.json` specifically so *"every future
lane"* could find it. This wave has **four new flows**, and P4 separately records **three**
still unmet:

| Flow | Owner | Why it is NEW |
|---|---|---|
| Opening-balance seed + trial-balance tie-out | T2 | no analogue in the product; a lifecycle with dry-run, correction and supersession |
| Coding-lane triage | T7 | a work-queue-into-lanes surface the product has never had |
| Counterparty merge / alias hygiene | T8 | a dedupe-and-merge flow, destructive and irreversible |
| In-thread onboarding checklist card | T11 | R7's superseding shape; no wizard precedent to copy |
| Multi-tenant signup with an approval hold | P4 | recorded unmet |
| Operator approval queue | P4 | recorded unmet |
| Members + roles table with an invite dialog | P4 | recorded unmet |

Trains T1, T3, T4, T5, T6, T9 and T10 owe **nothing** here — each extends an established
pattern (register write surfaces, propose/sign governance panels, door dialogs), and the rule
is scoped to NEW flows, not new screens.

*Recommendation:* **one grounding lane covering all seven**, extending the live
docs/p4-mobbin-grounding branch rather than opening a second. It must complete before
Wave C forks (T2 and T11 are in Wave C) and before Wave B's T7 and T8 start their design —
so it runs concurrently with Wave A. If Mobbin authentication cannot be completed
autonomously, as it could not in the P4 session, the honest outcome is a recorded UNMET with
the three named flows carried forward — not a silent skip, and not a claim of grounding that
did not happen.

---

## Provenance

Every `apps/web` structural claim in both parts was read at the file on this branch's tip and
cited `file:line`: the test enumeration (`apps/web/package.json:13`, 68 paths measured), the
needs-you row switch (`apps/web/components/firm/needs-you-row.tsx:98`), the closed row-kind
world (`apps/web/lib/firm/needs-you.ts:57`), the registers tabs
(`apps/web/components/registers/registers-workbench.tsx:17`), the client tabs
(`apps/web/components/client-workspace-nav.tsx:9`), the deliberate door-dialog copy
(`apps/web/components/reports/DoorDialog.tsx:7`), and the route manifest's own sync
instruction (`apps/web/lib/command/routes.ts:21`). The P3 lane sizing is a direct file and
line count over `apps/web/components/` and `apps/web/lib/` per domain. The
`apps/dashboard` figures (217 TypeScript files, 61 tests) are a direct count.

The door roster is the census's, not this lane's: `verb-coverage-census-2026-08-28.md` is the
authority, and where this plan's name-level arithmetic differs from its headline counts, §2
of part 1 states the difference rather than resolving it.
