# The PORT WAVE plan — every full-product userflow into the agentic UI (2026-08-28)

*Planning lane (`claude-opus-5`), 2026-08-28. **Plan only — no build.** The owner ruled
**A** on 2026-08-28: "beta is a live launch; every full-product userflow lives in the
agentic UI." That collapses the census's disposition sheet — the three-option P6 cutover
ruling and the 29 orphan dispositions — into one answer: **port them all**, and retire
`apps/dashboard` when the wave completes.*

*Ground: `docs/plan/active/verb-coverage-census-2026-08-28.md` (the authoritative roster) ·
`PROGRESS.md` · `docs/plan/active/mohe-grill-rulings-2026-08-27.md` (Q1-Q9, Q-A…Q-F) ·
`docs/plan/active/mohe-grill-rulings-2026-08-27-evening.md` (R1-R7) ·
`docs/plan/active/harness-audit-rulings-2026-08-26.md` (R8/R9) ·
`docs/plan/active/frontend-handoff-2026-08-23.md` + `docs/plan/active/frontend-handoff-addendum-2026-08-24.md` ·
`docs/plan/active/fa7b-gate-record.md` · `apps/web/AGENTS.md` ·
`docs/phase2-research/design-direction-synthesis.md` (the adopted design law) ·
`docs/adr/0031-queue-section-order-needs-you-first.md`.*

*Every structural claim about `apps/web` below was read at the file on this branch's tip
and is cited `file:line`. Nothing is inherited from a summary.*

**Companion: `port-wave-plan-2026-08-28-part2.md`** — §7 the ladder, §8 the P6 wire bump
and the cutover PR, §9 exit gates (**§9.3 is the named first-execution note for T1 and
T9**), §10 effort and dependencies, §11 non-goals, §12 the seven questions and the
**conductor's adoptions of all seven, 2026-08-28**, §13 the Mobbin grounding debt.

---

## 1 · Scope, and what ruling A settles

Ruling A ends three questions the census left open, and opens one it did not ask.

**Settled.** Disposition 1 (the P6 cutover scope) resolves to *port-all* — not
"port-critical + a dashboard behind an admin flag", not "port-critical + named Known-issues
deferrals". Disposition 2 (the 29 orphans) resolves to *give each a journey home*, with the
owner's own mapping supplied with this task and reproduced in §4. Disposition 3
(`requeue_render_job`'s possible unrecorded P3 scope-down) resolves by construction: it gets
a home in T9 regardless of whether the earlier scope-down was recorded, so the reconciliation
becomes a docs line rather than a blocker.

**Opened.** Port-all means the *last* surface the dashboard uniquely owns disappears at the
cutover PR. Everything downstream of that — the proxy repoint, the Cloudflare Pages
retirement, and the disposition of `apps/dashboard`'s 61 test files — becomes load-bearing
rather than housekeeping. §8 of part 2 makes it a first-class PR with its own ladder, not a
tail on the last train.

**What this wave is NOT.** It is not a redesign. Every train extends surfaces the P3 fold
already proved, under the same house laws in `apps/web/AGENTS.md`, and the P3 design set is
the newest exemplar. It is not a backend wave: **every door in scope is already LIVE at the
`0138` frontier** — the census measured that, and the frontend is the only thing missing.
No migration is owed by any train in this plan.

---

## 2 · The roster: 115 names, and how they reconcile against the census headline

The census's headline is **81 CUTOVER-OWED + 29 ORPHAN**. Its own domain lists, counted by
name, give a different number, and this plan works from the **names** — because a name is
what a train can be handed and a count is not.

| Source | Name-slots | Distinct names |
|---|---|---|
| CUTOVER-OWED domain lists (17+13+11+11+15+7+12+2) | 88 | **87** — the census itself flags `withdraw_draft` as counted twice |
| ORPHAN list (4+4+4+7+2+8) | 29 | **29** |
| Overlap across the two lists | — | **1** (`requeue_render_job` appears in both) |
| **Union** | — | **115** |

**87 vs the headline 81.** The census names the likely cause itself: *"Seven of the
adjustment reads are double-tagged RULING: apps/web deliberately reads the tables instead —
the registers-read-only ruling Q3 — so their 'owed' half is the WRITE surface."* Seven
double-tagged reads counted into class (c) rather than the 81 accounts for six of the gap;
the census also states a `±2` imprecision in the metrics lane's c/d split and reports it
rather than smoothing it. **This plan does not re-derive the census.** It works the 115
names, and the exit-gate re-run (§9, part 2) reconciles the arithmetic against a fresh
measurement — the only honest way to close a counting discrepancy.

**Where the 115 go.**

| Disposition | Count | Detail |
|---|---|---|
| Port-wave trains T1-T11 | **109** | §4 |
| Route to P4 (not this wave) | **3** | `create_firm` · `users_visible` · `set_firm_high_stakes_threshold` |
| Excepted by the owner (not ported) | **3** | `verify_snapshot` → a DR runbook line · `get_journal_entry` (single-arg) → retirement candidate · `record_notification` → verify-then-decide |

The lead's brief counts "the 24 journey-mapped orphans": 29 orphans − 4 named exceptions −
1 double-count with the 81 list = 24. That arithmetic checks out, and this plan carries
`set_firm_high_stakes_threshold` as *routed to P4* rather than *excepted*, per the owner's
own mapping ("→ P4 settings switch") — it gets a home, just not one this wave builds.

---

## 3 · The structural finding: four shared files are the whole wave's merge risk

P3 ran five parallel lanes and folded cleanly. Eleven will not, for a reason that has
nothing to do with the work: **four files in `apps/web` are edited by every train**, and one
of them fails silently when a merge goes wrong.

### 3.1 The silent one — `apps/web/package.json`

The Node 20 test runner does not directory-scan for `.test.ts` (`apps/web/AGENTS.md:18-19`).
Every test file is enumerated by hand in the `test` script — **68 paths on one
2,152-character line** (`apps/web/package.json:13`). Eleven trains each appending 2-5 paths
means ~40 more on that same line.

A git conflict on a single 2 KB line resolved with "take theirs" silently deletes another
train's tests, **and nothing goes red** — the runner simply runs fewer files and reports
green. This is the exact failure the P2 fold lesson names (Node-20 `--test` drops `.test.ts`;
enumerate plus a count control), and it is the sharpest hazard in the wave.

**T0 fixes the mechanism, not the discipline**: move the enumeration to a checked-in
manifest with **one path per line** (so a conflict is line-local to the train that caused
it), and add a count-control gate that globs `*.test.ts*` on disk and **fails CI when a file
on disk is absent from the manifest**. That converts "silently never runs" into a hard red.

### 3.2 The needs-you row switch — `apps/web/components/firm/needs-you-row.tsx`

Today exactly one row kind carries an inline act:
`row.row_kind === "open_question"` (`apps/web/components/firm/needs-you-row.tsx:98`), against
the eight-value closed world in `apps/web/lib/firm/needs-you.ts` (`REVIEW_QUEUE_ROW_KINDS`,
line 57). Four trains want inline affordances for their own kinds — coding tasks (T7),
lint findings (T7), compliance watches (T10), fixed-asset and staff-advance incompletes
(T3/T5). All four would edit the same conditional.

**T0 lands a row-kind → affordance registry** keyed by `row_kind`, so each train registers
its own kind from its own file and `needs-you-row.tsx` stops growing a branch per domain.
The closed-world membership check (`isKnownReviewQueueRowKind`) stays exactly as the FIX-1
review round left it — the registry is a dispatch table behind that check, never a
replacement for it.

### 3.3 The two tab arrays

`apps/web/components/registers/registers-workbench.tsx:17` holds
`const TABS = ["aging", "fixedAssets", "adjustments", "staffAdvances", "accounts"]`, and
`apps/web/components/client-workspace-nav.tsx:9` holds the eight-entry `CLIENT_TABS`. Four
trains touch the first (T3, T4, T5, T8), three the second (T2, T7, and the close train's
fiscal-year surface if it earns its own route).

**T0 pre-lands the final arrays**, with every not-yet-built tab rendering a `NotBuiltNote`
that names its verb and its train. This is the census's own newly minted law used as a build
mechanism rather than a cleanup obligation: *"every NotBuiltNote names the verb/train it
waits on; when that train merges, truing the note is part of the MERGE, not a later
discovery."* Each train then replaces the content of its own tab in its own file, and the
arrays never move again.

### 3.4 The locale file — `apps/web/messages/en.json`

23 top-level namespaces, one per surface. New namespaces are key-disjoint, so conflicts are
positional rather than semantic — but with eleven trains they will still happen.
**T0 assigns each train its own top-level namespace up front** and pre-lands the empty
namespace blocks in the file's existing order, so a train's diff is confined to its own block.

### 3.5 What is NOT a hotspot — a deliberate house pattern, checked

`apps/web/components/close/CloseDoorDialog.tsx` and
`apps/web/components/reports/DoorDialog.tsx` are near-identical, and the obvious planning
move is to promote one to `apps/web/components/common/`. **Do not.** The reports copy documents the
decision in its own header: *"kept as its own small copy rather than a cross-domain import
so components/close and components/reports stay independently reviewable, each with its own
i18n namespace"* (`apps/web/components/reports/DoorDialog.tsx:7`). That is a recorded
decision, and it happens to be exactly what a wave of eleven parallel trains wants:
**one door dialog per domain, file-disjoint by construction.** Every train writes its own.

### 3.6 A fifth file that is a stale-claim risk, not a merge risk

`apps/web/lib/command/routes.ts` carries a `status: "built" | "planned"` per route and its
own instruction to *"re-derive this manifest from the live `apps/web/app/` tree"* rather than
hand-maintain it (`apps/web/lib/command/routes.ts:21`). Every `status: "planned"` entry is a
**dated claim** of exactly the kind the census's STALE-NOT-BUILT class was minted for — it
goes false the moment a train merges, and nothing updates it.

**Ruling to carry as a wave law:** truing `routes.ts` is part of a train's own merge, never
a later sweep. The exit-gate conformance re-audit (§9) re-derives the whole manifest from
the live `apps/web/app/` tree as a control.

---

## 4 · The train partition

Eleven trains plus a seam PR. Every one of the 109 in-scope names appears in exactly one
train. "Size" is relative to one P3 lane, calibrated against what P3 actually produced on
this branch: bank 43 files / 4,813 lines · documents 33 / 4,246 · journals 20 / 3,163 ·
close+reports 26 / 3,565 · firm+registers 37 / 3,419 — so **1.0 ≈ 20-40 files, ~3,000-4,500
lines, ~10-14 doors, through the full ladder**.

### T0 · The seam PR — *size 0.3 · no doors*

The four shared extension points from §3, landed before any train forks: the test manifest
plus its count-control gate · the needs-you row-kind affordance registry · the final `TABS`
and `CLIENT_TABS` arrays with `NotBuiltNote` placeholders naming each train · the eleven
pre-landed i18n namespace blocks. Also lands this plan's train-to-namespace table as a
comment in `apps/web/messages/en.json`'s owning module, so a later reader can tell which
train owns which block.

**Merges alone. Nothing forks until it is on `main`.**

---

### T1 · Close lifecycle + fiscal year — *size 1.0 · 9 doors · extends the close workbench*

`open_fiscal_year` · `propose_fiscal_year` · `get_close_readiness` ·
`record_future_attestation` · `hold_close_prep` · `release_close_prep` ·
`list_agent_act_receipts` · `settle_close_proposal` · `set_client_fy_end`

Journeys 18 (close — the three keys) and the fiscal-year prerequisite. Extends
`apps/web/components/close/` — no new route. **This train closes the census's headline
product-level find:** *"nothing in the entire product (web or dashboard) can open a fiscal
year today; the close model is live-inert awaiting a first `open_fiscal_year` that has no
trigger anywhere."* `PROGRESS.md` confirms the DB side: zero `fiscal_years` rows, activation
is the first human `open_fiscal_year`.

`set_client_fy_end` sits here rather than in a client-settings surface that does not exist,
because the FY end is the fiscal-year opener's own precondition and belongs beside it.

**Live-lane collision — read before scoping.** The web/stale-notes-truing lane is, per the
census, *"wiring the needs-you reads + four live doors and truing the close note as this file
is written"*, and the four live doors it names are `0138`'s — `hold_close_prep`,
`release_close_prep`, `list_agent_act_receipts`, `settle_close_proposal`, which is 4 of T1's
9. **T1 re-censuses at that lane's merged tip and scopes to what remains.** See OQ-1.

### T2 · Opening & carry-down — *size 1.3 · 11 doors · NEW workbench*

`create_opening_seed` · `approve_opening_seed` · `cancel_opening_seed` ·
`reopen_opening_seed` · `approve_opening_correction` · `draft_opening_item` ·
`record_opening_target` · `record_opening_keyed_resolution` · `get_opening_dryrun` ·
`supersede_opening_item` · `seed_fixed_asset`

Journey 6 (carry-down / opening seed / TB tie-out). The largest genuinely new surface in the
wave: a seed lifecycle (create → draft items → dry-run → approve, with correction,
supersession and reopen paths) that is a heavy refer-back-to object by the synthesis's own
promotion test, so it is a workbench, not a card.

**Depends on F-A7b's ruled playbook states, not its code.** `fa7b-gate-record.md` rules that
bank-only and shoebox take **no opening seed** — deferred activation, a visible banner, a
chase list, the FY1 cost on screen day one, and no seal while the banner is up. T2's
workbench must render those states honestly, so the gate record is a design input.
`seed_fixed_asset` is the seam into T3 and belongs here because it is an *opening* act.

### T3 · Fixed assets & depreciation — *size 1.2 · 14 doors · extends registers*

`dispose_fixed_asset` · `complete_fixed_asset_particulars` · `revise_fixed_asset_particulars` ·
`retire_fa_account_profile` · `upsert_fa_account_profile` · `get_fixed_asset` ·
`fa_register_tie` · `run_depreciation_manual` · `get_depreciation_runs` ·
`list_depreciation_runs` · `propose_depreciation_authority` · `sign_depreciation_authority` ·
`retire_depreciation_authority` · `get_depreciation_authority`

Journey 17. Extends `apps/web/components/registers/fixed-assets-register.tsx` (today a
read-only register under the Q3 ruling) with the write surface, plus a **new depreciation
authority panel** — a propose/sign/retire ceremony that is a two-person governed act, not a
form. The propose/sign shape is already house-proven by the reports domain's
register/supersede-recipient doors, so it is an extension of an existing pattern rather than
a new flow.

`fa_register_tie` is a tie-out read: it renders as a state banner on the register, never as
a number the UI computes.

### T4 · Adjustments, templates & accounts — *size 1.0 · 12 doors · extends registers*

`upsert_account` · `propose_adjustment_template` · `sign_adjustment_template` ·
`retire_adjustment_template` · `run_adjustment_manual` · `get_adjustment_runs` ·
`list_adjustment_runs` · `list_adjustment_templates` · `reverse_adjustment_pair` ·
`approve_pair_reversal` · `cancel_pair_reversal` · `adjustment_run_due`

Journey 17. This is the train the census's seven double-tagged RULING reads belong to: under
Q3 apps/web deliberately reads the adjustment tables directly, **so the owed half is the
WRITE surface** and this train must not replace working table reads with RPC reads. It adds
the template governance panel (propose/sign/retire), the manual run door, and the pair
reversal ceremony (reverse → approve/cancel).

`adjustment_run_due` is grouped under fixed-assets/depreciation in the census; it is placed
here on its subject matter. If T4's opening verb census finds it keyed to the depreciation
belt instead, it re-homes to T3 — a one-line scope move, recorded, not a re-plan.

`upsert_account` extends `apps/web/components/registers/chart-of-accounts-register.tsx`.

### T5 · Staff advances — *size 0.5 · 7 doors · extends registers*

`book_staff_advance_application` · `complete_staff_advance_particulars` ·
`enrol_staff_advance_account` · `retire_staff_advance_account` · `staff_advance_statement` ·
`staff_advance_summary` · `staff_advance_tie`

Journey 17. The smallest train: one existing read register
(`apps/web/components/registers/staff-advances-register.tsx`) gains its application,
particulars, enrolment and statement doors. Note hard constraint 13's BEE case — a sole
proprietor is not an employee and his account is EQUITY; the surface must not imply
otherwise in its copy.

### T6 · Drafts & document governance — *size 0.8 · 9 doors · extends journals + documents*

Journals half: `approve_routine_entry` · `get_entry_diff` · `get_doc_entry_diff` ·
`withdraw_draft` · `answer_interruption`
Documents half: `get_document_extract` · `request_autodraft` · `request_reextraction` ·
`classify_consent_evidence_document`

Journeys 9 and 12. One train rather than two because the two halves meet at exactly one
seam — `get_doc_entry_diff` and `get_document_extract` are the document↔entry join — and
splitting them would put that seam across a merge boundary. The file sets stay disjoint from
every other train (`apps/web/components/journals/`, `apps/web/components/documents/`).

`request_autodraft` is the runtime's own *"one-click admission entry"* per the census; it is
the highest-value single orphan in the documents journey.

### T7 · Coding, questions & quality signals — *size 1.2 · 14 doors · NEW surface + needs-you*

Coding: `coding_lane` · `list_coding_lanes` · `open_coding_task` · `complete_coding_task` ·
`dismiss_coding_task` · `list_uncoded_filings`
Questions: `get_open_question` · `open_question` · `promote_clarify_to_question`
Signals: `get_lint_finding` · `resolve_lint_finding` · `get_sweep_run` ·
`acknowledge_sweep_run` · `cancel_agent_task`

Journeys 14, 22, 24. A **new coding-lane surface** (triage of uncoded filings into lanes and
tasks) plus the needs-you inline affordances for four row kinds. `open_question` is the
*raising* half — resolve and dismiss are already wired — and `promote_clarify_to_question`
turns a rail clarification into a durable firm question, which is the seam into the P6
`firm_question` part.

`cancel_agent_task` belongs on the activity/receipts feed
(`apps/web/components/firm/firm-activity-feed.tsx`), not the coding surface — it is a
control over a running agent task, and the receipts feed is where a human sees one.

### T8 · AR/AP statements & counterparty hygiene — *size 0.9 · 10 doors · extends registers + NEW panel*

Statements: `customer_statement` · `supplier_statement`
Counterparty: `create_counterparty` · `set_counterparty_terms` · `add_counterparty_alias` ·
`retire_counterparty_alias` · `rename_counterparty` · `merge_counterparties`
Allocation: `apply_open_items` · `unallocate_group`

Journey 15. Extends `apps/web/components/registers/aging-register.tsx` with statements, and
adds a **counterparty hygiene panel** — alias, rename and merge are a dedupe flow, which is
genuinely new and owes a Mobbin grounding (§13, part 2).

`apply_open_items` and `unallocate_group` are the census's *remedy-text-only* orphans:
*"each exists ONLY inside refusal/remedy text that tells a human to use a door no surface
offers."* They are read here as AR/AP allocation verbs, which is a **judgement this plan
makes and T8's verb census must confirm at the live body** before building. If they turn out
to be bank-settlement verbs, they re-home to a bank ride-along. See OQ-4.

### T9 · Reports authoring, snapshots, wiki & seeding — *size 1.0 · 9 doors · extends reports + knowledge*

Snapshots: `mint_month_snapshot` · `snapshot_state` · `requeue_render_job`
Seeding: `cancel_seeding_batch` · `complete_seeding_batch` · `decline_seeding_proposal` ·
`tick_seeding_proposal`
Authoring/curation: `create_account_set_v1` · `retire_wiki_page`

Journeys 19, 20 and the knowledge half of 9. `PROGRESS.md` records the snapshot registry as
**live-inert** — zero `reporting_periods` / `period_snapshots` rows until the first
`mint_month_snapshot` — so this train, like T1, lights a path that has never carried a run.
That makes its rung-5 live walk unusually load-bearing.

`create_account_set_v1` is flagged: the census calls it *"the human body F-A5's agent core
was derived FROM, never wired."* Porting a body that a live agent core supersedes may be
wrong. T9's census decides; see OQ-5.

### T10 · Firm admin: vendor bindings, compliance & sharing — *size 0.9 · 9 doors · extends firm surfaces*

Compliance: `ack_compliance_watch` · `snooze_compliance_watch` · `resolve_compliance_watch`
Vendor bindings: `list_vendor_bindings` · `get_vendor_bindings` ·
`propose_vendor_identity_binding` · `sign_vendor_identity_binding` ·
`revoke_vendor_identity_binding`
Sharing: `share_chat_session`

Journeys 22, 25, 26. Compliance watches get their needs-you inline affordances (T0's
registry) plus a firm-altitude panel; vendor identity bindings get a propose/sign/revoke
governance panel under `/admin`; `share_chat_session` attaches to the Clara thread surface.

**Boundary with P4:** `create_firm` is P4's, not this train's — P4 extracts
`_create_firm_core` and gives it a second entrance from `approve_firm_registration`. T10
must not build a second `create_firm` surface. Same for `users_visible` (P4's members page)
and `set_firm_high_stakes_threshold` (P4's settings switch).

### T11 · Client onboarding five — *size 0.7 · 5 doors · in-thread, not pages*

`begin_client_onboarding` · `cancel_client_onboarding` · `commit_client_onboarding` ·
`bootstrap_client_plan` · `resolve_onboarding_plan_item`

Journey 5. **R7 governs the shape:** the primary form is the Clara in-thread interview (the
F-A7 wake surface already built), with a **structured progress checklist card rendered as
parts alongside the thread**; the prototype's separate wizard pages are superseded, and that
is a recorded divergence rather than a gap. So this train builds a checklist card and the
five doors' affordances *inside the thread surface*, not a `/onboarding` route.

**Depends on the F-A7b build train**, whose gate closed BUILD-AUTHORIZED on 2026-08-27 but
whose train has not built. T11 is the wave's only hard external dependency; §6 sequences it
last and §12 states the fallback.

---

## 5 · Agentic presentation — how each door surfaces

The house philosophy, from the adopted synthesis (`docs/phase2-research/design-direction-synthesis.md`)
and the mohe rulings, gives four surfaces and one promotion line. Restated so a train can
apply it without re-reading three documents:

- **A needs-you row** — for something Clara raises that blocks a human and has a cost of
  delay. `docs/adr/0031-queue-section-order-needs-you-first.md` puts `needs_you` before
  `needs_review` because *"the queue optimizes for cost of delay, not volume."* A row is a
  pointer plus at most one inline act; everything heavier is a link into the object that
  owns its verbs.
- **A workbench panel** — for a significant, standalone, iterated, refer-back-to object.
  The synthesis's promotion line: *"small decisions stay inline chips; heavy,
  refer-back-to objects expand into the workbench."*
- **A door dialog** — for a governed human act. One click opens, one confirm performs
  **exactly one** governed call, never a batch; the refusal renders verbatim in the caller's
  persistent banner, never inside the dialog
  (`apps/web/components/close/CloseDoorDialog.tsx:1-10`).
- **Conversational reach** — the rail. Q8 is explicit that all new Wave-F surfaces build
  **workbench-first on direct RLS reads plus governed doors, zero wire change**, and that
  the chat wire adds exactly four part types in one bump. So in this wave, conversational
  reach means the rail can *talk about* these objects; only four of them get a card, at P6.

**The binding negative law, from the base handoff §5:** *"if an action has no named backend
verb, the UI does not offer it. Never simulate an action client-side, and never compose two
verbs into one button that implies atomicity the DB does not give."* Nothing in this wave
ships as a bare form dump, and nothing composes two doors into one control.

| Train | Needs-you rows | Workbench panels | Door dialogs | Clara-raised card (P6) | Mobbin owed |
|---|---|---|---|---|---|
| T1 close + FY | — (close prep holds surface on the close plan) | fiscal-year opener · readiness · agent-act receipts · prep holds | open-year · attest-future · settle-proposal · set-FY-end | **`close_proposal`** · **`agent_receipt`** | no |
| T2 opening | seed awaiting approval | seed lifecycle · draft items · dry-run tie-out · deferred-activation banner + chase list | approve/cancel/reopen seed · approve correction · supersede item | — | **yes** |
| T3 fixed assets | `fixed_asset_incomplete` inline complete | FA register write surface · depreciation runs · **authority panel** | dispose · complete/revise particulars · propose/sign/retire authority · run depreciation | — | no |
| T4 adjustments | — | template register · run history · pair-reversal ledger | propose/sign/retire template · run manual · reverse/approve/cancel pair · upsert account | — | no |
| T5 staff advances | `staff_advance_incomplete` inline complete | advances register write surface · statement · summary | book application · complete particulars · enrol/retire account | — | no |
| T6 drafts + docs | `draft` row links (no inline act — the diff is the decision) | entry diff · doc-entry diff · document extract | approve routine · withdraw draft · answer interruption · request autodraft/re-extraction · classify consent evidence | — | no |
| T7 coding + questions | `coding_task` · `lint_finding` · `open_question` (raise) inline acts | **coding lane surface** · uncoded filings · sweep runs | open/complete/dismiss coding task · open question · promote clarify · resolve lint · acknowledge sweep · cancel agent task | **`firm_question`** | **yes** |
| T8 AR/AP + counterparty | — | customer/supplier statements · **counterparty hygiene panel** | create counterparty · set terms · add/retire alias · rename · **merge** · apply open items · unallocate group | — | **yes** |
| T9 reports + seeding | `seeding_proposal` tick/decline | snapshot registry · render-job queue · wiki curation · account-set authoring | mint snapshot · requeue render · cancel/complete batch · decline/tick proposal · retire wiki page | — | no |
| T10 firm admin | `compliance_watch` ack/snooze/resolve inline | compliance register · **vendor bindings panel** | ack/snooze/resolve watch · propose/sign/revoke binding · share chat session | — | no |
| T11 onboarding | onboarding plan item | **in-thread checklist card** (parts, R7) | begin/cancel/commit onboarding · bootstrap plan · resolve plan item | — | **yes** |

**On `merge_counterparties` specifically.** A merge is destructive and irreversible from the
user's point of view. It gets the heaviest treatment in the wave: a preview panel showing
exactly what both sides carry, read from the DB, before the dialog opens — and the dialog's
confirm performs the one governed call whose refusal the DB owns. The UI computes nothing
about what the merge will do.

---

## 6 · Ordering and parallelism

### The wave graph

```
  T0 seam  ──────────────────────────────────────────────►  (merges alone, blocks all)
     │
     ├── WAVE A (4 concurrent)   T3 fixed assets · T5 staff advances
     │                           T6 drafts+docs   · T9 reports+seeding
     │
     ├── WAVE B (4 concurrent)   T4 adjustments   · T8 AR/AP+counterparty
     │                           T7 coding+signals· T10 firm admin
     │
     └── WAVE C (3 concurrent)   T1 close+FY      · T2 opening
                                 T11 onboarding five
                                        │
                          WAVE D  ──────┴──►  P6 four-part wire bump (chatTurn_v15)
                                        │
                          WAVE E  ──────┴──►  exit gates → the cutover PR
```

### Why this order

**Wave A is the low-risk opener.** Four extensions of surfaces P3 already proved, no new
routes, no shared-file contention beyond what T0 already resolved. Two registers lanes (T3,
T5) plus two entirely separate directory sets (journals+documents, reports+knowledge). It
also front-loads the two register tabs that gain the most new behaviour, so their patterns
land before Wave B's two register lanes copy them.

**Wave B carries the needs-you contention.** T7 and T10 both register row-kind affordances;
T4 and T8 are the second pair of register lanes. This wave is the T0 registry's real test,
which is why it runs second rather than first — if the registry is wrong, one wave of
evidence exists before four lanes depend on it.

**Wave C carries every external dependency.** T1 waits on web/stale-notes-truing; T2 wants
F-A7b's ruled playbook states as a design input; T11 waits on the F-A7b build train. Putting
all three last means no other train is blocked by a dependency it does not own.

**Wave D is P6's four-part wire bump** — `agent_receipt`, `firm_question`, `close_proposal`,
`freeform_result`, in **one** `chatTurn_v15` runtime version bump, catalog 18 → 22. It runs
after Wave C because three of the four parts have their workbench half in T1 and T7, and Q8's
whole point is that the workbench ships first on zero wire change. `freeform_result`'s
workbench half is already live from P3.

**Wave E is the exit gate plus the cutover.** Detailed in part 2, §8 and §9.

### Concurrency budget

Three build waves of 3-4 lanes each. P3 ran five concurrent lanes through the full ladder and
folded cleanly, so 4 is inside proven capacity with margin for the review lanes each train
needs. Each git-active lane takes **its own worktree** (Q9's conduct clause, and the lesson
that the shared tree once bit a builder).

### Where the census re-run and the conformance re-audit sit

Both are **exit gates in Wave E, and neither is a train's own responsibility** — a train
cannot audit itself. The census re-run measures direction 1 and direction 2 afresh at the
then-current frontier; the conformance re-audit re-derives the ⌘K route manifest from the live
`apps/web/app/` tree and sweeps every `NotBuiltNote` for a claim that went false. Part 2, §9.
