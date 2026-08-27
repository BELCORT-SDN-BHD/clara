# Mobbin grounding — the port wave's four NEW flows (T2/T7/T8/T11)

*Grounding lane (`claude-sonnet-5`), 2026-08-28, dispatched from the 磨合 frontend train's
port-wave conductor. Closes §13 (in port-wave-plan-2026-08-28-part2.md)'s four-flow half of the
Mobbin grounding debt — T2 (opening balances / carry-down), T7 (coding-lane triage), T8
(counterparty merge) and T11 (in-thread onboarding checklist card). §13's other three
(signup-to-holding, operator approval queue, invite/RBAC) are P4's and are closed already by
p4-mobbin-grounding-2026-08-28.md, which this file is a sibling of rather than an extension
of — the merged file would exceed the harness's 500-line split limit, and the two files
ground disjoint trains (P4 vs. the port wave) so nothing is lost by keeping them separate.
Both companion documents live on their own not-yet-merged branches (docs/port-wave-plan,
docs/p4-mobbin-grounding) — named here in plain text rather than as backtick paths because
neither is present on this branch's tree yet for the harness-links gate to resolve.*

**Same ground rule as the sibling file, restated (`AGENTS.md` constraint 1, per the ClaraBook
handoff): Mobbin informs flow structure and interaction patterns only.** Clara's tokens,
motion and copy philosophy are LAW — `docs/design/PRODUCT_DESIGN.md`, the honest-state
discipline in `apps/web/components/common/state.tsx`, and the fail-closed/no-optimistic-UI
rules in `apps/web/AGENTS.md` override any pattern below where they collide. Every "maps to"
line names an **existing** Clara component (`apps/web/components/ui/`,
`apps/web/components/common/`, `apps/web/components/parts/`) — this lane introduces no new
primitive; §5 below flags the one place a reference pulls toward one.

**Method.** `mcp__mobbin__search_screens`, platform `web`, deep mode, limit 2-3 per query, one
query per concrete pattern. Every screen below was visually inspected, not inferred from
metadata. `search_flows` was not needed — each of the four flows resolved cleanly from
single-screen references, unlike the sibling file's signup journey.

---

## T2 · Opening balances / carry-down workbench

Maps to port-wave-plan-2026-08-28.md §4 T2 — the seed lifecycle (create → draft items →
dry-run tie-out → approve, with correction/supersession/reopen paths), the largest genuinely
new surface in the wave.

**References.**
- [Xero — "Reconcile period" draft](https://mobbin.com/screens/9757b384-b445-42f5-9e19-e0d588bd137b) —
  a left-to-right arithmetic strip (Opening statement balance − Payments + Deposits =
  Period balance − Closing statement balance = **Difference**, the difference rendered in red
  with a warning glyph when non-zero), an "Outstanding" section listing the transactions
  causing the gap, and a persistent "Draft" chip on the page itself plus "Exit draft" /
  "Close period" footer actions.
- [QuickBooks — "Reconcile"](https://mobbin.com/screens/869dfa1d-8c53-4dac-96a1-6fd98999d1b8) —
  the same arithmetic idea rendered as four stat callouts (Statement ending balance, Cleared
  balance, Beginning balance, N payments/deposits) converging on one **Difference** figure with
  a warning triangle, and a transaction table below split into Payments/Deposits/All tabs with
  a per-row checkbox to mark cleared.
- [Wave — "Ending statement balance" dialog](https://mobbin.com/screens/7b3a8357-9eed-415c-ac76-2776640ba1ae) —
  the minimal end: a two-field dialog (Ending Balance Date, Ending Balance Amount) that is
  the *entry point* into a reconciliation, gated behind Cancel/Save, no arithmetic shown yet.

**Takeaways → Clara vocabulary.**

1. **The tie-out is arithmetic shown as a strip or stat row, converging on one signed
   difference — never a bare pass/fail.** Both Xero and QuickBooks keep every term of the
   equation visible (opening + movements − closing = difference) so the user can see *why* a
   gap exists, not just that one does. T2's `get_opening_dryrun` result maps to this shape:
   render the DB-returned terms (opening seed total, draft-item deltas, target) as a row of
   labeled figures ending in a difference, inside a `Card`/`CardHeader` — never a UI-computed
   sum. This is `AGENTS.md` constraint 2 applied to the strip itself: every number in it,
   including the difference, is a value the dry-run door returned, not client arithmetic on
   values the door returned separately (a client-side subtraction of two DB numbers is itself
   a model/UI-generated numeral the instant rounding or currency handling diverges from the
   evaluator's).
2. **Zero difference is a distinct, quiet state — not the same visual weight as a warning.**
   Xero's red-triangle-on-nonzero / QuickBooks's warning-triangle-on-nonzero both reserve the
   loud treatment for "does not tie" and render "ties" as a plain green single equals sign, not
   a banner. Map to `StateBanner` (`apps/web/components/common/state.tsx`) with `tone="success"`
   (quiet) when the dry-run difference is zero and `tone="warning"` when it isn't, carrying the
   DB's own figure in the children slot — never a fabricated "looks good!" sentence.
3. **Outstanding-items-causing-the-gap is a table, not a number alone.** Xero's "Outstanding"
   section is what makes the difference actionable — the same shape T2's draft-items list
   needs: `Table` (`apps/web/components/ui/table.tsx`) under a `SectionHeader` level 2
   ("Draft items"), each row carrying enough to act on it (account, target, current value),
   which is what makes `supersede_opening_item` and `record_opening_keyed_resolution`
   reachable per-row rather than through a separate screen.
4. **A "Draft" state chip on the whole page (Xero) is the right idiom for the seed lifecycle's
   own state, not a full-page banner.** T2's seed carries states beyond draft (approved,
   correction-pending, superseded, reopened) — map to `Badge` (`apps/web/components/ui/badge.tsx`)
   next to the page title in `PageHeader`, `variant="secondary"` for draft/pending states,
   rather than a `StateBanner` (reserve the banner for the dry-run's own tie-out result, per
   takeaway 2 — two banners stacked on one page would blur which one the user is meant to act on).
5. **Wave's plain entry-point dialog is the shape for `create_opening_seed` itself** — a small
   `Dialog` (`apps/web/components/ui/dialog.tsx`) that starts the lifecycle, not a wizard page;
   the workbench (Xero/QuickBooks shape above) is where the lifecycle then lives.
6. **The F-A7b deferred-activation banner has no reference here — genuine gap, not a design
   choice to import.** None of the three references show a "no opening seed for this client"
   state (bank-only/shoebox per `fa7b-gate-record.md`), because none of these products have an
   analogous "this account category doesn't get this feature" carve-out. Build it as its own
   `StateBanner tone="info"` variant per T2's existing spec in the port-wave plan — nothing to
   graft from a reference.

---

## T7 · Coding-lane triage

Maps to port-wave-plan-2026-08-28.md §4 T7 — a **new** work-queue surface (`coding_lane` /
`list_coding_lanes` / `open_coding_task` / `complete_coding_task` / `dismiss_coding_task` /
`list_uncoded_filings`), the product's first triage-into-lanes surface.

**References.**
- [Plain — "All threads" board](https://mobbin.com/screens/fe789301-27f7-4169-8060-2766831eec51) —
  a left rail of named lanes as a status tree (Needs first response, Needs next response,
  Investigating, Waiting for customer, Paused, Done, Ignored — each with a live count), a
  center board grouped into columns by that same status, a right-click **Group by** control
  (Status / other), and a per-card "+"-style quick action.
- [Reddit — mod "Queue"](https://mobbin.com/screens/5235c7c3-4277-469a-b9c9-97adc6b778f5) —
  tabs across the top (Needs Review / Reported / Removed / Edited / Unmoderated) instead of a
  board, one item at a time with inline `Approve` / `Flair` / `Lock` / `Copy link` /
  `Add to highlights` actions directly under the content — no dialog, no navigation away.
- [Gorgias — ticket table with bulk actions](https://mobbin.com/screens/357dd278-8487-4c89-bd05-14d2c3ccc0c5) —
  cited as the anti-pattern: a filterable table with row checkboxes and a bulk action bar
  (Close / Assign to Me / Assign to Team / Add Tag / More → Apply macro / Change priority /
  Export / **Delete**).

**Takeaways → Clara vocabulary.**

1. **Lanes as named groups (Plain), tabs as status filters (Reddit) — Clara's five verbs
   (`coding_lane`, `open_coding_task`, `complete_coding_task`, `dismiss_coding_task`,
   `list_uncoded_filings`) fit Plain's shape better.** A `coding_lane` is a durable grouping a
   task is *opened into*, not a transient filter over one list — closer to Plain's persistent
   named columns than Reddit's five status tabs over one queue. Map to `apps/web/components/registers/`'s
   existing tab convention (`SectionTabs`, `apps/web/components/common/section-tabs.tsx`) for
   switching between lanes, with each lane's task list rendered as a `Table`
   (`apps/web/components/ui/table.tsx`) under a `SectionHeader` — not a drag-and-drop board.
   **Flag for the design/build lane:** Plain's board view is drag-and-drop between columns,
   which implies a client-side move gesture composing into a single door call; the port-wave
   plan's binding law (§5: "never simulate an action client-side") means a lane change is
   `open_coding_task` with a new lane argument through a `Select`, never a drag target — the
   *grouped-column* idea transfers, the *drag* mechanic does not.
2. **Per-item inline actions (Reddit), never a bulk bar (Gorgias) — the anti-pattern is the
   clearer lesson here.** `complete_coding_task` and `dismiss_coding_task` each carry a single
   task id; Gorgias's bulk "Close (N)" / "Delete" pattern implies exactly the "compose two
   verbs into one control" shape the port-wave plan's binding negative law (§5, from the base
   handoff) forbids — there is no `complete_coding_tasks` plural door. Map to Reddit's row-level
   inline `Button`s (`apps/web/components/ui/button.tsx`, `variant="outline"` for Complete,
   plain text/ghost for Dismiss) directly on each `Table` row or `needs-you` inline chip
   (`apps/web/components/firm/needs-you-row.tsx`) — one click, one call, no selection state.
3. **`open_coding_task` (the raising half) is a needs-you row, not a queue entry point.** Per
   the port-wave plan's own table (§5), `coding_task` gets an inline "open" affordance on the
   needs-you registry (`apps/web/lib/firm/needs-you.ts`) alongside `lint_finding` and
   `open_question` — none of the three references model this distinction (all three treat
   "raise" and "triage" as the same list), but Clara's needs-you/workbench split already
   resolves it: raising happens where Clara surfaces the row; triage happens on the coding-lane
   surface itself. No reference contradicts this, it's simply orthogonal to what any of the
   three products show.
4. **`list_uncoded_filings` is the queue's *source* list, distinct from the lane board —
   closer to Reddit's "Unmoderated" tab than to anything inside Plain's board.** Map to its own
   `SectionTabs` entry ("Uncoded") feeding into `open_coding_task`, which is the door that
   moves an item from that list into a lane — again, one call, not a drag.
5. **`cancel_agent_task` does not belong on this surface — confirmed by absence.** None of the
   three references show a "cancel the automated process that's running" control on a triage
   board, because none of the three references are triaging *agent* work. This matches the
   port-wave plan's own placement of `cancel_agent_task` on
   `apps/web/components/firm/firm-activity-feed.tsx` instead (§4 T7) — the Mobbin search
   confirms rather than contradicts that placement.

---

## T8 · Counterparty merge / alias hygiene

Maps to port-wave-plan-2026-08-28.md §4 T8 — `merge_counterparties` plus
`add_counterparty_alias` / `retire_counterparty_alias` / `rename_counterparty`, a destructive,
irreversible dedupe flow. **The anti-pattern lens matters most here**, per the dispatch.

**References.**
- [Salesforce — "Compare leads" merge](https://mobbin.com/screens/eb7abb1d-f6fe-432c-b6f9-495dfdb360af) —
  a full field-by-field comparison table, two columns (one per candidate record), a radio
  button on *every* field letting the user pick which side's value survives (plus a
  "Use as principal" radio choosing which record absorbs the other), a caption stating exactly
  what merging does ("the principal record is updated with the values you choose, and
  relationships to other items are shifted to the principal record"), and a `Back`/`Next`
  footer — merge is not the final action on this screen, it's a multi-step wizard.
- [ManyChat — "You're about to merge two contacts" dialog](https://mobbin.com/screens/7c5ba065-40ce-48ca-80a2-bcfac03d550d) —
  a single dialog (not a full page) that states the consequence in an info callout *before* any
  field comparison ("All Secondary Contact information... will be connected to the Primary
  Contact... The merge will delete the Secondary Contact"), a Primary/Secondary picker, then a
  `Cancel` / `Preview` footer — `Preview` is a **separate, named step from the merge itself**,
  not a label on the destructive button.
- [folk — "You're about to merge 2 people"](https://mobbin.com/screens/ca3f42a1-bbf0-41fe-a634-9514f736f557) —
  cited as the anti-pattern: two small avatar cards side by side, a couple of radio-selected
  fields, and a single black `Merge` button — no stated consequence, no explicit preview step,
  no distinction between "see what will happen" and "do it."

**Takeaways → Clara vocabulary.**

1. **The load-bearing lesson is ManyChat's *named, separate* preview step — this is the
   pattern to copy, and folk is exactly what NOT to build.** The port-wave plan already
   requires this independently ("a preview panel showing exactly what both sides carry, read
   from the DB, before the dialog opens... the UI computes nothing about what the merge will
   do" — §5 note on `merge_counterparties`); Mobbin confirms it's a recognized real-world
   pattern (ManyChat) with a recognized failure mode right next to it (folk, one click, no
   named preview). Map to two steps: (a) a read-only comparison `Card` rendering both
   counterparties' DB-held fields side by side (Salesforce's field-table shape, but read-only —
   Clara's merge has no field-level "pick a winner" concept since `merge_counterparties`'s
   signature is a single directional call, not a field-by-field union — see takeaway 2), then
   (b) `apps/web/components/ui/dialog.tsx` with the consequence stated in prose (ManyChat's
   callout copy pattern: state what moves, what gets retired) and a `Button variant="destructive"`
   labeled "Merge" as the *only* control in the dialog itself.
2. **Salesforce's per-field radio picker does not match the backend ask — flag, do not
   build.** `merge_counterparties`'s signature (per §4 T8) does not offer field-level
   reconciliation; a merge folds one counterparty's records into another's, not a value-by-value
   union of two records' attributes. Building Salesforce's per-field radio grid would either be
   decorative (fields the door doesn't accept) or imply a capability the door doesn't have.
   **Recommend the read-only comparison card (no radios) instead** — show both counterparties'
   held data (aliases, terms, open-item counts) so the human can *judge* the merge, without
   offering controls the door can't honor.
3. **Alias/rename are NOT this dialog — they're lighter, reversible acts and get lighter
   treatment.** None of the three merge references double as an alias/rename flow, which is
   the right separation: `add_counterparty_alias` / `retire_counterparty_alias` /
   `rename_counterparty` are non-destructive (an alias can be retired, a rename has no
   "un-rename" but changes no relationships) and belong on the counterparty hygiene panel as
   plain inline `Button`s or a small `Dialog` with a single `Input`, not the merge ceremony's
   two-step treatment. Reserving the heavy pattern for the one truly irreversible verb keeps
   the weight signal honest — if every hygiene action got the merge treatment, the merge
   wouldn't read as special.
4. **The comparison card's numbers are DB-read, never computed — the same constraint-2
   discipline as T2.** Whatever the preview shows (transaction counts, open-item totals per
   counterparty) must come from a read the merge preview door returns, not a client-side count
   over rows the UI already has loaded — the counts could be stale or paginated differently
   from what the merge door will actually act on.

---

## T11 · In-thread onboarding checklist card

Maps to port-wave-plan-2026-08-28.md §4 T11 — **R7's ruling governs the shape**: the primary
form is the Clara in-thread interview (F-A7 wake surface), with "a structured progress
checklist card rendered as parts alongside the thread." The prototype's separate wizard pages
are a **recorded divergence**, not a gap — so this grounding deliberately searched for the
card pattern, never a wizard.

**References.**
- [Manus — "Task progress" card](https://mobbin.com/screens/f7cc29b0-b12c-4154-b870-8f1cb4410d5a) —
  an agent-conversation UI where a card ("Manus's computer", with an activity icon and
  collapse chevron) sits inline in the message stream, headed "Task progress" with a **N/N**
  counter, and a checklist below it — each line has a green checkmark and struck-through-style
  completed styling ("Research Korean holiday destinations and prepare slide content" ✓,
  "Apply Mahogany theme and update all slides" ✓, "Deliver the final presentation to the user"
  ✓) — the card updates in place as the agent's own turns complete each step, never replacing
  the thread with a separate view.
- [Lightfield — numbered task list in chat](https://mobbin.com/screens/5b5f4b9f-5940-47a0-845d-f6c74bac4de8) —
  a plain numbered list (1-15) rendered as ordinary assistant message text ("I created the
  following Front onboarding tasks..."), with a **separate** checkbox-style "Task created" line
  above each — closer to a receipt-per-item than a single stateful checklist card.
- [Slack — onboarding checklist in a side Canvas panel](https://mobbin.com/screens/89f80c4d-daf7-4cb5-a9a5-6dd99bd1bdf6) —
  cited as the anti-pattern for R7's purposes: the checklist ("✅ Your First Week Tasks",
  checkbox items, a meetings table) lives in a **persistent side panel** next to the DM thread,
  not inline in the conversation — exactly the "separate page/panel" shape R7 supersedes.

**Takeaways → Clara vocabulary.**

1. **Manus is the direct hit — a stateful card inline in the message stream, N/N counter,
   checkmarks that flip live as steps complete, never leaving the thread.** This is the closest
   available real-world precedent for exactly what R7 specifies. Map to Clara's existing parts
   pattern: a new part type rendered by `apps/web/components/parts/PartRenderer.tsx` alongside
   the existing `SUMMARY_TYPES` (`je_review`, `doc_review`, `diff`, …,
   `apps/web/components/parts/PartRenderer.tsx:26`) — extend `PartSummaryCard`
   (`apps/web/components/parts/PartSummaryCard.tsx`) or a sibling small component in the same
   directory, keeping its shape (`title`, a list of labeled rows, a note) but adding a
   completed/pending boolean per row so each renders with or without Manus's checkmark
   treatment. **This is a card-catalog extension the P6 four-part wire bump (§8 of the
   port-wave plan) already has room for** — T11's `firm_question`-style promotion isn't listed
   in the wave's Clara-raised-card column (§5 table shows T11 already gets one: "**in-thread
   checklist card (parts, R7)**") — so nothing here asks for anything the plan didn't already
   name; it confirms the pattern with a real reference.
2. **The N/N counter (Manus) matters more than it looks — it's the honest-progress idiom, not
   a fabricated percentage.** Manus shows "3 / 3" — a plain count of true/false items, never an
   interpolated "75% done" bar. T11's five doors (`begin_client_onboarding` →
   `bootstrap_client_plan` → `resolve_onboarding_plan_item` × N → `commit_client_onboarding`)
   map onto exactly this: a completed-count over the plan's own item total, both DB-read values
   — never a client-computed percentage, which would be the same fabricated-progress problem
   the sibling file's §1 takeaway 1 already named for the P4 holding screen.
3. **Lightfield's per-item message-text receipts do NOT match R7's "structured... card"
   language — flag as a rejected alternative, not a gap.** Lightfield renders each task as
   its own inline chip-plus-line rather than one persistent stateful object; R7 specifically
   asks for one card, not N receipts, so this shape is noted and set aside rather than adopted.
4. **Slack's side-Canvas checklist is the clearest anti-pattern for this specific train — flag
   for any later lane tempted by it.** A side panel is exactly the "separate surface" R7's
   ruling supersedes ("the prototype's separate wizard pages are superseded, and that is a
   recorded divergence rather than a gap"). A persistent side panel is not a wizard page, but
   it's the same underlying mistake — pulling the onboarding state out of the thread into a
   surface of its own. **Do not build a side panel for T11's checklist under any framing**
   ("Canvas," "drawer," "inspector") — the card lives in the message stream or it isn't R7's
   shape.
5. **`cancel_client_onboarding` has no reference in any of the three** — expected, since none
   of the three products model an abandonable multi-step agent task with an explicit cancel
   verb visible in the card itself. No pattern to import; this stays whatever door-dialog
   treatment the thread's existing interruption/cancel affordances already use elsewhere in
   the F-A7 wake surface (outside this grounding's scope to re-derive).

---

## Flags for the port-wave conductor / owner — not applied here

Recorded so the conductor or owner can rule on them before the affected train starts building;
nothing in this file changes port-wave-plan-2026-08-28.md or its part 2, or their annexes.

1. **T7: reject a drag-and-drop lane board even though Plain's reference uses one** — map the
   grouped-lanes *idea* to `SectionTabs` + per-row inline actions instead, because a drag
   gesture implies a client-side move composing into a single door call, which the wave's own
   binding negative law forbids. See T7 takeaway 1.
2. **T7: no bulk approve/dismiss, matching the sibling file's P4 finding almost verbatim** —
   Gorgias's bulk-action bar doesn't fit `complete_coding_task`/`dismiss_coding_task`'s
   single-id signatures. See T7 takeaway 2. (This is the third time this exact anti-pattern has
   surfaced across two grounding sessions — P4's approval queue and now T7's triage — worth
   naming as a house-wide rule rather than a per-train note if a later lane hits a fourth case.)
3. **T8: reject Salesforce's per-field radio-picker merge UI** — `merge_counterparties`'s
   signature doesn't offer field-level reconciliation, so a field-by-field chooser would be
   decorative or misleading. Recommend the read-only comparison card instead. See T8 takeaway 2.
4. **T11: no side-panel/Canvas treatment under any name** for the progress checklist — it must
   render as a part inside the thread's message stream, per R7, confirmed against Manus's
   direct precedent and Slack's contrasting anti-pattern. See T11 takeaway 4.
5. **T11: the checklist part type needs a design decision on where its schema lands** — this
   grounding maps it to an extension of the existing `PartSummaryCard`/`SUMMARY_TYPES` shape in
   `apps/web/components/parts/`, but the actual wire-format addition (new `ClaraPart` variant,
   `apps/web/lib/parts/types.ts`, `apps/web/lib/parts/catalog.ts`) is P6's four-part wire bump to specify, not
   this grounding lane's to design. Flagging so P6's bump doesn't treat T11's card as an
   afterthought against the four parts it already names.

---

## Companions

port-wave-plan-2026-08-28.md and its part 2 (plan of record; §13 is what this file closes,
jointly with the P4 sibling) · p4-mobbin-grounding-2026-08-28.md (the sibling grounding file —
P4's three flows) — both named in plain text per the note at the top of this file, pending
their own branches' merge · `docs/plan/active/verb-coverage-census-2026-08-28.md` (roster
authority behind T2/T7/T8/T11's door lists, already on `main`).
