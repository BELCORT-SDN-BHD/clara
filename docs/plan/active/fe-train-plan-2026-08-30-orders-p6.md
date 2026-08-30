# P6 work orders — P6-1 … P6-6, P6-T, P6-R, and the P6-X cutover

*Companion to [`fe-train-plan-2026-08-30.md`](fe-train-plan-2026-08-30.md) and
[`fe-train-plan-2026-08-30-orders-p4.md`](fe-train-plan-2026-08-30-orders-p4.md). **Every order
here inherits that file's §0 preamble in full** — the reading list, rung-0 at the LIVE body, the
worktree/junction mechanics, the four verify commands, the manifest rule, the five instrument laws,
the named-skills rule, and the report shape. Only the deltas are restated below.*

**P6 runs at 裁-9's tier (c), full depth** — every built surface re-checked screen by screen
against the COMPLETE resource set (the token contract, the design-rule docs, the FD-001..FD-047
decision log, the handoff repo's EMIL-CRAFT-AUDIT, all eight vendored Emil skills, the shadcn registry + live
MCP, the Mobbin references, and the high-fidelity prototype screens). **Deviations are recorded by
ruling, never absorbed.** No P6 order may start before the entry gate (plan §5.1) closes.

---

## P6-1 · `chatTurn_v16` — the runtime half of the four-part bump

**Branch:** runtime/chatturn-v16. **Size 0.8. Depends on: the P6 entry gate.**
**`.claude/rules/runtime-workflows.md` binds this order.**

**Read the truing first.** Every prior document names this bump *"`chatTurn_v15`"*. **That version
is taken.** `packages/runtime/workflows/chatTurn.v15.prompt.ts:10` says in its own frozen header
that `ClaraPartV15` **IS** `ClaraPartV14` — *"NO NEW PART KIND … the `freeform_result` card belongs
to P6's own later batched wire bump"* — `:33` proves it (`export type ClaraPartV15 = ClaraPartV14;`),
and `registry.ts:61` reads `chatTurn: chatTurn_v15`, deployed as Fly **v69**. **This order is
`_v16`.** Verify both facts yourself before writing a line; if the registry has moved again, that is
a scope note to the lead, not something to work around.

**Scope.** A **new frozen closure** `chatTurn.v16.*` beside byte-untouched `v1..v15`, extending v15
the way v15 extends v14 — re-export every carried shape, add exactly the four Q8 kinds:
`agent_receipt` (generic; reads `agent_receipts_visible`) · `firm_question` (carries the
resolve/dismiss doors' subject) · `close_proposal` · `freeform_result`. Then repoint `registry.ts`.
**Never edit a frozen body**, and remember that the prompt and tool files inside a frozen closure
*are* that body — `pnpm freeze:update` is for a brand-new frozen CLASS only; if freeze-lint demands
an update for your change, you edited a frozen body: undo it.

**Live/working state stays at the SSE layer, not as a persisted part type** (Q8, verbatim).

**Verify.** `pnpm --filter @clara/runtime typecheck` · `test` · **`build`, then grep the built
output directory for `chatTurn_v16`** — the WDK compiler can silently swallow a directive, so the
source reading
correctly and the build succeeding are **not** evidence the behaviour shipped. Report the grep.

**Deploy is a separate ceremony from merged `main`, run by the lead** — and the standing lesson
binds: prove the serving bundle by an **in-VM bundle grep** for `chatTurn: chatTurn_v16`, never by
the deploy's own success (`PROGRESS.md` records the 2026-08-26 case where the tag was assumed and
the bundle was still on v13). **Rollback preflight** before any revert: confirm the target image
still exports every workflow name and version holding non-terminal runs.

**Acceptance.** v1..v15 byte-identical (prove it — `git diff --stat` on those paths is empty) ·
freeze-lint passes without a manifest regeneration · the four kinds' field lists are the file's
own declarations · the built-bundle grep is in the report.

---

## P6-2 · The card wave — union 22 → 26, four rich cards, the sweep-card upgrade

**Branch:** web/p6-2-cards. **Size 0.9. Depends on P6-1 MERGED** (not designed — merged).
**Mobbin/skills: `emil-design-eng`, `animate`, `shadcn`; the card catalog in `docs/design/`.**

**Why this waits for P6-1's merge.** `apps/web/lib/parts/types.ts:104-108` states the law: *"the
runtime is the declarer, this module is the reader … do not 'improve' a field name or widen a type
here: a mismatch would make the renderer read a field the wire does not carry."* **Transcribe each
of the four shapes field for field from the merged `chatTurn.v16.*` closure.** Writing both halves
in one pass would have the reader and the declarer written by the same hand — exactly the mismatch
that law exists to prevent.

**Files:**

```
apps/web/lib/parts/types.ts                  EDIT  the union, 22 -> 26
apps/web/lib/parts/catalog.ts                EDIT  four entries with fixtures
apps/web/components/parts/PartRenderer.tsx   EDIT  four render branches + the sweep upgrade
apps/web/components/parts/V16Cards.tsx       NEW   the four rich cards
apps/web/messages/en.json                    EDIT  one new namespace
```

The `AllCovered`/`NoExtra` guards make a missing catalog entry a `tsc` failure and the parity test
makes a missing render branch a test failure — **the mechanism enforces its own completeness**, so
do not add a hand-written "did I cover them all" assertion.

**裁-20 · the sweep card, in the same PR and needing NO wire change.** `SweepReceiptPart` already
exists in the live 22-member union and renders today as a generic id-only summary
(`PartRenderer.tsx:55` → `PartSummaryCard`). Upgrade it to a rich card that hydrates
`clara.get_sweep_run(run_id)` on mount and, on a FINALIZED run, offers the audited **bookkeeper+**
`acknowledge_sweep_run`. `components/firm/sweep-status-panel.tsx:8-28` carries the rung-0 note that
named this home; **true that comment in this PR** rather than leaving a claim that went stale.

**裁-44 · the tax-draft card is a NAMED PLACEHOLDER, not a card — and its shape is NOT yours.**
The part type is designed by the **`ft3-taxprep-design`** lane, alongside the `tax_prep` wake body,
its needs-you card and its allowlist rows. Record the reserved shape in a comment beside the four,
naming that lane and 裁-44, and **ship nothing** — a card for a part nothing emits is the same
defect as a control for a door that does not exist. Do not invent its fields to "get ahead": the
reader-is-never-the-declarer law above binds this one twice over, since here the declarer is another
lane's design as well as another package's code.

**A conformance debt this train pays because it is already inside the file (裁-3 tier (a): fixed as
found, never deferred).** `apps/web/components/parts/PartRenderer.tsx:160-163` states in its own
comment that **the ten summary titles above it are still hardcoded English** — *"an older debt this
change does not silently widen and does not pretend to have paid."* That violates the next-intl
house law, and it is also what would red the Q5 hardcoded-string lint the day it lands. **Route all
ten through next-intl in this PR**, with the strings in the same namespace the four new cards use.
It is a mechanical change in a file you are already editing; leaving it makes the next lane pay a
merge conflict for it.

**Hydrate-never-trust.** Every card carries identifiers only and re-derives authoritative state from
a pinned DB read on mount and after every act, through the shared `useHydratedPart` hook (its
`act()` already reloads on success *and* failure with a sticky refusal). **The UI never invents a
number, verb, receipt or link.** `agent_receipt`'s link-out goes to the workbench that owns the
object — **not** to a byte download, which F-A5b PR-3 has not built (plan §4).

**Tests.** Extend `apps/web/lib/parts/catalog.test.tsx` (fixtures for all four) · an a11y file per
new card · a card suite beside the new component with a **discriminating**
post-condition per act · a RED-before mutant for each refusal branch · the sweep card's
acknowledge gate asserted **through `clickButton`** (it throws on a disabled node — assert the gate,
then act).

**Acceptance.** All four commands green · catalog exactly 26 with the `tsc` guards intact · the
four shapes byte-match the merged runtime declarations (say how you checked) · the sweep card
hydrates and acknowledges, with its stale rung-0 comment trued · the tax-draft placeholder ships as
a comment, not a component.

---

## P6-3 · The a11y + token finish — 裁-13, 裁-1, 裁-2 4c

**Branch:** web/p6-3-a11y-tokens. **Size 0.8. Depends on P4-3 merged** (the cream ground must
exist before its composited rows can be honest). **Skills: `impeccable`, `emil-design-eng`, `shadcn`.**

**Three ruled items, executed in one PR because they share three files.**

**① 裁-13 · the WCAG 2.2 SC 2.5.8 target-size gate.** A real CI gate in
`apps/web/test/a11yRules.ts` (the hand-written rule engine — **not axe-core**; the P3 finale
recorded a confirmed axe false positive on a correctly-labelled button). Honour the token
contract's own documented-exception mechanism (**`--target-min`**): every dense-table shortfall
becomes a **visible, reasoned exception**, never a silent downgrade. Q7's formal 2.1 AA bar is
unchanged; 2.5.8 is adopted **on top of** it. There is **no known-violation pinning mechanism** by
design — a real violation is a component fix, never an allowlist entry.

**② 裁-1 · the focus ring at 70%, R3's arm (b), and the Button treatment.** **Nothing has been
recut, and `globals.css` says so about itself** — `:185-200` is a comment headed *"FOCUS TREATMENT
— RULED 2026-08-27 evening (R3), RECUT STILL OWED"*, concluding *"nothing has been recut yet. The
flat `:focus-visible` outline is still what this file declares, so the two idioms still coexist"*,
while `:447-450` declares that flat outline. **Read that comment before you touch anything: it is
the previous lane telling you exactly what state you are inheriting, and your PR replaces it rather
than deleting it.** Ten components carry the ring idiom today, **all still at `/50`** — and the
robust census is the **colour token, not the width or the variant**: `grep -rl "ring-ring/50" apps/web/components/` returns exactly ten —

```
components/ui/button.tsx          components/ui/input.tsx
components/ui/textarea.tsx        components/ui/select.tsx
components/ui/badge.tsx           <- spells it ring-[3px], not focus-visible:ring-3
components/ui/input-group.tsx     <- on the WRAPPER, via
                                     has-[[data-slot=input-group-control]:focus-visible]:ring-3,
                                     so the literal focus-visible: prefix never appears
components/common/native-select.tsx        components/common/section-tabs.tsx
components/journals/drafts-queue-panel.tsx components/clara/ClaraThreadView.tsx
```

(all relative to `apps/web/`). **That census took three attempts to get right; re-run it, do not
trust this list blind.**

**The order inside the PR is annex 2 §F's and it is not negotiable: rule (done — 裁-1 = 70%) →
change the components → add the rows.** At 0.65 the accent ground measures 2.970 and would red CI
the day after approval; 0.70 clears all six gated grounds with ≥0.270 margin. Then add the six
composited rows to `PAIR_SPECS` in `apps/web/scripts/check-token-contrast.mjs` (currently **27
pairs**, all passing) using the existing `composite(fgToken, alpha, overHex)` helper — **no schema
change is needed**, the `destructive-on-destructive-10` row already uses it.

**A gate blind spot to close in the same PR:** the two existing focus rows
(`focus-ring-on-background`, `focus-ring-on-shell`) both use `fg: (h) => h("focus")` — the **solid**
token — and cite only the base outline rule. Ten components render the translucent idiom and no
pair sees it, so **the gate is green on a treatment that is not there.**

**The Button is a separate decision** (plan §6 OQ-2). `--ring` and `--primary` are the same hex, so
a default Button's swapped border against its own fill measures **1.000** and no halo alpha fixes
it. This lane's recommendation is an **offset ring**; take the owner's ruling if one has landed,
and if not, propose rather than decide.

**Executing R3 literally EXTENDS the failure** unless you handle it: unifying on the ring strips the
compliant base `:focus-visible` outline (6.20 today) from every plain link, list row and custom
control, growing the population from ten components to every focusable element. **Keep the base
outline as the fallback for anything not carrying the shadcn idiom**, and say so in the source.

**③ 裁-2 4c · the `--input` recut.** `app/globals.css:247` still reads `--input: #c7c5bd`, which
never reaches 3:1 on any product ground (1.728 white, 1.611 shell, 1.598 cream, 1.594
surface-subtle) while `apps/web/components/ui/input.tsx` ships `bg-transparent` — so the border is the only
identifier and SC 1.4.11 applies squarely. **Plan §6 OQ-1 is open:** the ruling puts the recut in
the `clarabook-frontend` repo first. **Recommendation, needing the lead's confirmation before you
author:** set the value here and open the clarabook recut PR in the same sitting. Add
`input-on-background`, `input-on-card`, `input-on-shell` and `input-on-identity-canvas` at threshold
3 **with** the token change, never before it.

**Write every `source` string after the component exists, not from the design** — the gate is only
as honest as those strings, and a row whose source is aspirational makes the gate assert a
composition nothing renders.

**Acceptance.** All four commands green · the target-size gate RED on a deliberately undersized
fixture (prove it) · every `--target-min` exception visible and reasoned · the ten-carrier census
re-run and reported by file · six composited rows added and passing at 0.70 · the two solid focus
rows corrected · the base-outline fallback preserved and documented · `--input`'s rows landing with
its value.

---

## P6-4 · ONE shared signed money input

**Branch:** web/p6-4-money-input. **Size 0.6. Depends on: the entry gate.** **Skills: `tdd`,
`codebase-design`, `emil-design-eng`.**

**Why this is its own train.** Money entry has produced two of the estate's most expensive
frontend defects: Wave A's *"a residual input that turned a typed RM50.00 into RM5.00 (three doors,
proven key-by-key)"* and Wave C's *"a signed money field that could not take a negative"*. There
are currently **four independent implementations**, plus eleven consumers — all paths relative to
`apps/web/`:

```
THE FOUR
  components/journals/use-amount-input.ts               the hook, line 23
  components/registers/opening-signed-amount-input.tsx  SignedAmountInput, line 55
  components/close/close-money-input.tsx
  components/registers/staff-advance-money-input.tsx

THE CONSUMERS
  components/journals/entry-lines-editor.tsx        components/registers/adjustment-lines-editor.tsx
  components/registers/opening-lines-editor.tsx     components/registers/opening-item-fields.tsx
  components/registers/opening-fixed-asset-dialog.tsx
  components/registers/opening-target-keyed-panel.tsx
  components/registers/staff-advance-lines-editor.tsx
  components/registers/staff-advance-allocations-editor.tsx
  components/registers/fa-particulars-fields.tsx    components/bank/matching-section.tsx
  components/close/FutureAttestationPanel.tsx
```

**Re-census this list yourself** — it is a grep on a moving tree, not a fixed roster.

**Deliverable.** One shared component + hook under `apps/web/components/common/`, with the union of
every behaviour the four carry: cents-integer state (**never a float**), the signed case, paste,
keystroke fidelity, `inputMode`/`aria` correctness, and disabled/readonly. **Migrate every call
site**; delete the superseded implementations; keep each one's existing tests pointed at the shared
component so their coverage survives the move.

**Acceptance.** All four commands green · **a key-by-key test proving RM50.00 stays 5000 cents**,
and a paste test · a negative-entry test on the signed variant · every migrated call site's prior
test still asserting its prior behaviour · the manifest count reconciled by NAME after the
deletions · **no number is computed in the UI** — the input carries cents to a door and the DB owns
every total.

---

## P6-5 · The agentic surface finish

**Branch:** web/p6-5-agentic-finish. **Size 0.7. Depends on P6-2 merged** (the sweep card).

**① 裁-37 · ⌘K "Do", behind a LIVE allowlist check.** Today
`apps/web/components/command/command-palette.tsx` ships a statically disabled row. Light it **only for the DB-allowlisted wake verbs**, with **a live
allowlist check per action** — the palette asks the database what it may do, **every time**, rather
than shipping a hard-coded list that drifts the day a grant changes. Use the same allowlist-read
shape the rest of the estate uses; this mints no new mechanism. **`apps/web/messages/en.json`'s
`disabledLabel` and every sibling "built in P3" string** (lines 33, 37, 106, 123, 153, 464, 948 and
1044 per the audit) get an undated honest form in the same PR.

**② 裁-27 · "Amend resolution" on a RESOLVED onboarding item (T11 N2).** The live
`resolve_onboarding_plan_item` re-resolves an item in any state; the card disables settled items,
and the card is the ONLY surface — so a mis-typed answer is uncorrectable from inside the product.
Allow the amend. **The append-only audit trail already exists, so the amend is a new resolution row,
never an edit of the old one** — render the prior answer and its supersession, not a mutation.

**③ The seventh firm-question kind.** `apps/web/lib/firm/needs-you-gaps.ts:34-41` pins **six**
kinds while the live CHECK carries **seven** — `0142:222` widened it with `onboarding_proposed`.
The renderer is fail-soft, so nothing is broken; what is missing is the card for Clara's own
"I think this document is a new client" proposal. Extend the array (never a standalone string
literal — that file's own comment states the discipline) and give the kind its affordance.

**④ 裁-17's polish notes.** Inbox rows **deep-link to the owning tab/object**, not the
client-workspace root; each row gains a **"ask Clara about this"** handoff carrying the row's
context into the rail.

**Acceptance.** All four commands green · the Do allowlist read proven to be **per-action and
live** (a test in which the allowlist changes between two invocations and the palette follows) ·
every dated "P3" string gone (grep the diff) · the amend renders as a new row with the prior
resolution still visible · the seventh kind asserted against the live CHECK's own value ·
`routes.test.ts` still green with its vacuity control intact.

---

## P6-6 · The identity finish

**Branch:** web/p6-6-identity. **Size 0.6. Depends on P4-3 and P6-3 merged.**
**Skills: `impeccable`, `frontend-design`, `emil-design-eng`, `animate`, `apple-design`.**

**① 裁-14 · the Clara mascot.** `apps/web/public/` holds **five font files and nothing else** —
there is no mascot asset. Port it and implement **under the token contract's §7 rules exactly**:
**empty states and rare welcome moments only, NEVER a loader**, and `prefers-reduced-motion`
honoured with its own arm (the codebase already carries four such blocks — match that idiom).

**② R1 · the Ledger Fold mark**, ported and placed on the (entry) layout P4-3 built.

**③ The ClaraBook product-name copy pass**, across every surface. Note the as-conducted ruling that
bounds it: the `ClaraBook*` **component-naming** convention is **NOT BINDING** (the house adopted
domain folders through P2/P3's reviewed builds) — conformance binds at the **token / pattern / a11y
/ motion** level, not the export-naming level. This pass is product copy, not a rename.

**④ The entry-face finish** — 裁-2 4a's white-card-on-canvas treatment, taken from structural
(P4-3) to finished, with the third conformance pass's prototype screens as the parity reference.

**Craft rules that bind and are already held** (the handoff repo's EMIL-CRAFT-AUDIT, verified consumed): **no
`transition-all`**; ⌘K deliberately skips decorative dialog motion. Do not regress either.

**Acceptance.** All four commands green · the mascot appears in **no** loading state anywhere
(grep the diff and say so) · a `prefers-reduced-motion` arm on every motion utility added · the
copy pass swept surface by surface with the list in the report · zero raw hex and zero
default-palette classes (the eslint ban is now mechanical — confirm it did not need suppressing).

---

## P6-T · Track B's frontend home — the Tax tab, the deadline feed, the compliance line

**Branch:** web/p6-t-track-b. **Size 0.7. BACKEND-GATED — read this before scoping.**

裁-34 ruled one home each, **all of it in P6, with the backend — no new phase**: a **`Tax` tab on
the client workbench** (SST registration status · the period's output tax · the SST-02 draft from
F-T1; the R1–R10 draft card + the CP204 schedule from F-T3, **draft only**) · the payroll statutory
deadlines as a **FIRM-level needs-you feed** (Clara reminds; the deadline is not a page the firm has
to remember to open) · and **one line on the compliance register page**.

> **裁-44 FIXES THE TAB'S SHAPE, AND IT IS NOT A FORM.** Read this before you sketch a layout. Tax
> is **agentic on the same shape as the close**: after a close seals, **Clara drafts** the R1–R10
> computation and the CP204 estimate **unasked**, **every rung carrying its statutory citation and
> her own explanation of why the rung reads the way it does** — so a professional reviews reasoning,
> not just a number. The draft is pushed to the **needs-you inbox as a card**. She **proposes** each
> account's treatment (entertainment at 50%, the add-back families) and **a human signs** (裁-38).
> The SST-02 drafts when the taxable period closes, not when someone remembers; CP204 reminders are
> proactive. **So the tab is a PROPOSAL/RECEIPT surface with a human signing lane — never an input
> grid a professional types a computation into.** A lane that builds a form here has built the wrong
> surface, not merely an early one. 裁-33's draft-only wall (nothing reaches `issued`, enforced by a
> named refusal) is what "draft" means on this screen, and 裁-38's `treatment_code_unsigned` is why
> an unsigned treatment renders as unusable rather than as an empty field.

**Measured state of the three backends at `94afbbef`:** F-T1's PR-1 is **built but unmerged** and
~125 commits behind · F-T3 is **unbuilt**, and 裁-33 walls `issued` behind a named refusal so it
ships **draft-only** · F-T2's `statutory_deadlines` DDL is **live-EMPTY since `0139`** with **no
grant and no verb**. F-T2's `apps/dashboard` page target is dead by this same ruling — **the feed is
the target.**

**So this order's unconditional deliverable is the IA, and only the IA:** the
tax route under the client workspace, its entry in
`apps/web/components/client-workspace-nav.tsx`, its `apps/web/lib/command/routes.ts` rows, and
**one `NotBuiltNote`
per panel naming the verb and the lane that owes it** — the house mechanism, never a fake control.
Then **three ride-alongs, one per backend merge** (~0.2 each), each wiring its panel against the
doors that lane actually shipped. **Do not invent a panel for a door that does not exist**, and do
not let a NotBuiltNote outlive its lane — every one is swept at the exit gate.

**Acceptance.** All four commands green · the routes suite green with the new rows (its oracle
derives from the live tree, so a wrong href reds on its own) · a tax a11y file and the nav
extension · every NotBuiltNote naming **both** a verb and a lane · the three ride-alongs named in
the report with their preconditions · **the tab's shape reviewed against 裁-44 explicitly** — the
report states, in one sentence, why what shipped is a proposal/receipt surface and not a form.

---

## P6-R · The hygiene-panel ride-along — ONE PR, two debts, one component

**Branch:** web/p6-r-hygiene-panel. **Size 0.3. Depends on: nothing. Runnable whenever a lane is
free.** It is ONE PR because both debts land on
`apps/web/components/registers/counterparty-hygiene-panel.tsx`, and two lanes in one component buys
nothing but a conflict.

**① `clara.counterparty_aliases_visible`** (`0145:960-964`) — live, granted to
`clara_authenticated`, **zero readers**. Columns: `id, counterparty_id, alias_display,
alias_normalized, created_at, retired_at`. `apps/web/components/registers/RetireCounterpartyAliasDialog.tsx`
**exists and is imported by nothing** — mount it, and give `retire_counterparty_alias` the honest
alias id it has never had. **A merge checklist, not a surprise:** this wiring **will trip three
tests that positively PIN the absence** and **six stale comments** that assert the read does not
exist — `counterparty.test.ts:203` asserts *"exactly two reads … no counterparty_aliases read"*,
plus two a11y/keyboard tests stubbing a 403, and the comment sites at
`counterparty-hygiene-panel.tsx:10-20`, `messages/en.json:1876`,
`lib/registers/counterparty.ts:26-28,96-104,358` and `RetireCounterpartyAliasDialog.tsx:3-5`. **Fix
every one in this PR.** The 403 stubs target the BASE TABLE, which is still correctly denied — they
are aimed at the wrong relation now, not wrong in principle, so re-point them rather than deleting
them.

**② `clara.counterparty_merges`** (`0149:54-61`, whose own frontend-home block names this exact
panel) — also **zero readers**. And the door's receipt gained a key the frontend never read:
`merge_counterparties` now returns **`merge_id`**, while `MergeCounterpartiesResult`
(`apps/web/lib/registers/counterparty-doors.ts:132-137`) declares only `survivor_id`, `merged_id`,
`reissued_rule_id`, `reissued_autopost_rule_id`. **0149 says PR-3's dialog and PR-2's un-merge both
key on `merge_id`** — so this is not a cosmetic omission, it is the seam two scheduled PRs depend
on. Add the key to the type, read it at the call site, and hang the merge record off the row that
already renders the `statusMerged` chip.

**Acceptance.** All four commands green · both reads wired with a discriminating post-condition
each · the three absence pins re-pointed (not deleted) and the six comments trued, each named in the
report · `merge_id` present in the type AND consumed, with a cell that reds if it is dropped · a
RED-before mutant per refusal branch.

---

## P6-X · The cutover PR — retiring `apps/dashboard`

**Branch:** web/p6-x-cutover. **Size 0.5. CEREMONY-GRADE. Depends on: every train above, plus
both exit gates green (plan §5.2).**

> **The two exit gates are real work, not a sign-off, and one of them needs a rig.** The
> verb-coverage census must be **re-run against a LIVE CATALOG on a throwaway rig** — the standing
> census is **pinned to `0138`**, and **seven verb families minted at `0149`–`0155` have never been
> measured by it**, so this is their first measurement, not a re-confirmation. Migration-text greps
> do not substitute: the census's own header says revokes make them unreliable. And the
> **NotBuiltNote sweep is DERIVED FROM THE LIVE app TREE** on the routes-suite pattern
> (`apps/web/lib/command/routes.test.ts` reads the tree and carries a vacuity control) — enumerate
> the notes on disk, resolve each against the lane it names, fail on any whose lane merged. A
> hand-kept list is the STALE-NOT-BUILT class arriving through the back door.

**Run from merged `main`, never from a branch, with an as-run
record.**

**Measured scope:** `apps/dashboard` is **217 TypeScript files, of which 61 are test files**. The
base handoff §10.6 flags the disposition of those 61 as **UNVERIFIED** and ruling A does not settle
it — so it is an explicit deliverable here, not an assumption.

**Before the delete, classify each of the 61 suites into exactly one of:** ① **superseded** — an
`apps/web` equivalent exists and covers the same behaviour, **and the PR names it**; ② **migrated**
— no equivalent exists, so the suite moves to `apps/web` in this PR; ③ **retired with the surface**
— it tested a door whose only home was the dashboard and which ruling A did not port (expected:
near-zero); ④ **owner ruling needed** — it tests something neither app covers.
**A classification of "superseded" that names no equivalent is not evidence** — review law 2 applied
to the one place in this wave where the action is deleting 61 files.

**Sequencing inside the PR, and it matters.** The proxy repoint and the Pages retirement are
separable from the source delete and **must not ride the same commit**: repoint first, **prove the
Workers build serves every route**, *then* delete. A rollback after a repoint is a repoint; a
rollback after a delete is a restore.

**First act, before anything else: settle what `app.clarabook.com` actually serves today.** The
alignment audit could not (§5: *"no repo evidence either way, and absence is not proof"*).
`PROGRESS.md` names the Pages deployment serving the OLD `apps/dashboard`. **Check the deploy
record, do not derive it** — plan §6 OQ-5.

**Also owed at this gate** (R-3, two ruled dispositions with no follow-through): the
`verify_snapshot` DR-runbook line — `grep -rn "verify_snapshot" docs/ops/` returns **zero** — and
`record_notification`'s "verify-then-decide" verdict, which has no recorded outcome anywhere. Two
lines of documentation on already-ruled exceptions.

**Acceptance.** The 61-suite classification table in the PR body, every "superseded" naming its
equivalent · the repoint proven route by route **before** the delete commit · the as-run record
written · both exit gates' outputs attached · `PROGRESS.md`'s posture changed **only** after all of
it (port-wave §9.4: that is what "the wave completes" means).
