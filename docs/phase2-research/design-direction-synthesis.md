# Clara — Design Direction Synthesis (Phase 2)

**Phase 2 · Clara greenfield rebuild · design-direction input to the Gate-2 design docs**
**Author:** Fable design-synthesis worker · **Date:** 2026-07-17 · **Status:** synthesis of the four
design-research lanes into a single coherent DIRECTION. Input to the Phase-2 design SoT the orchestrator
finalizes — not itself binding until adopted. Yields to accounting-correctness > backend contract >
look/motion, and to every Gate-1 ruling (C1–C6, B) and the supervised-autonomy law.

**Synthesizes:** `design-genui.md` (generative-UI / card protocol) · `design-agentic.md` (agentic-workspace
interaction) · `design-saas.md` (professional density/trust/keyboard) · `design-agent-coexist.md`
(trust-manufacturing in professional-domain agents). Grounded in `04-gate1-decisions.md` and the 11
failure patterns in `00-GATE-1-README.md`. Finding IDs (D-*, J-*, H-*, Grt-*, GAP*, F3-*) refer to the
frozen-repo audit evidence.

---

## 0. The direction in one paragraph

Clara is **not a dashboard with a chat rail glued on** (the North-Star failure, pattern #3) and **not a
chat box that pretends to be an OS**. It is a **two-pane agentic accounting OS**: a stateful conversation
that is a *super-UI over the entire product*, coupled to a dense professional workbench, both reading **one
DB-authoritative state layer**. The conversation is where you *talk to* Clara; the workbench is where Clara
*works*; and the seam between them — the command surface, the typed context references, the URL, the card
protocol — is designed so that **removing the chat rail entirely still leaves a workbench that shows what
Clara did, why, with what evidence, and offers every Clara action as an object-level verb** (the agent-native
acceptance test). Every surface obeys one discipline borrowed from every credible professional-domain agent
(Harvey, Hebbia, Glean, Puzzle, Basis): **the agent may reason and propose freely, but every consequential
claim it renders is bound at creation to a verifiable, permissioned, DB-owned source, and a human — or a hard
DB rule — disposes before anything becomes authoritative.** The generative-UI ceiling is fixed: **text-to-
hydration, NEVER text-to-code** — the model chooses *which* developer-authored card, filled with *which*
DB-derived payload, in *which* order; it never authors the bytes that render or act on a number. The old
build had the right ceiling and the wrong wiring; this direction keeps the ceiling and rebuilds the wiring.

---

## 1. Core experience thesis — chat as stateful super-UI + workbench

### 1.1 The reframe

The five-beat trustworthy-agent loop (`design-agentic.md` §2) — **PLAN → SHOW → GATE → VERIFY → RECOVER** —
is the spine of the whole experience. Old Clara had beat 5's *ambition* (wakes, jobs) with none of its
durability, and essentially none of beats 1–4 as first-class surfaces. The direction makes that loop the
product's law, expressed in accounting terms.

Three convergent ideas define what "agent-native" actually *is* at the interaction layer:

1. **The command surface IS the product, not an accessory** (Raycast lens, `design-saas.md` §0). Clara is not
   a rail — Clara is **a set of actions available on every accounting object**, sitting in the *same* action
   surface as the human verbs. On a review row, the ActionPanel offers `Approve` / `Reverse` / `Open document`
   **and** `Ask Clara` / `Re-code` / `Explain this coding` — one keyboard-driven surface, human and agent
   verbs side by side. The chat rail becomes a *transcript + composer*, not the seat of the intelligence.

2. **The workbench's state layer IS Clara's context pack** (Figma lens). When the human filters the grid to
   `client=Acme · period=Q2-SST · status=review`, that *view descriptor* is the context Clara decides against
   — the same versioned state, freshly retrieved (a context pack with a freshness token), never an ad-hoc
   re-read of stale chat memory (fixes pattern #3, stale-context replay). The view descriptor is **shared
   truth for human, agent, and the audit story** ("send me the link to what you saw").

3. **Minimize the distance between intent and execution** (Notion/Matuschak lens). Clara's proposals live
   *inside* the objects the human already manipulates (the coded-account cell, the reconciliation row), the
   human can **take over any Clara draft mid-flight and hand it back**, and autonomy is a **per-client dial
   (thermostat), never a global on/off** — matching the supervised-autonomy law.

### 1.2 The two panes, one thread, one state

- **Chat pane (super-UI):** an ordered, typed, durable transcript. It streams Clara's reasoning, tool
  activity, and typed cards; it is the *reasoning trail* and the audit story of intent. An inline card
  **expands into the corresponding workbench surface without losing the conversation** (the display-mode
  ladder: inline → expanded → fullscreen, composer always overlaid — Apps SDK lens).
- **Workbench pane (durable objects):** the dense books grid, the review queue, the doc drawer, the recon
  table, the close plan, the export preview — the refer-back-to objects. A selection here **quotes back into
  chat as typed context** (entry ids, document ids, filter descriptors — not a prose label).
- **One state layer:** both panes read DB-authoritative state; every number, status, and confidence value is
  re-derived from the DB on render. Neither pane owns truth; the DB does.

**The acceptance criterion (adopt as a design test):** *remove the chat rail — the workbench must still show
what Clara did, why, with what evidence, and offer every Clara action as an object-level verb.* If removing
chat removes the intelligence, it was a bolt-on.

---

## 2. The generative-UI card system

### 2.1 The ceiling (non-negotiable)

**Clara is a fail-closed, developer-authored card catalog rendered from DB-authoritative structured payloads
— Apps-SDK-shaped, never Artifacts-shaped.** Keep the old LAW verbatim: **text-to-hydration, NEVER
text-to-code** (the fail-closed parser — unknown type renders nothing; bounded strings/rows/files;
safe-integer cents; no raw HTML — was audited as a genuine security asset and is PORT). The model's
generative freedom is *which card, filled with which DB-derived data, in which order* — never the card's
code. The rebuild's job is **wiring, not loosening**: every catalog card must be reachable by exactly one
authoritative emit path, live-render and hydrate-render **identically**, enforced by a **parity test that
fails the build** if the two extractors disagree (the direct fix for D-2).

### 2.2 The transcript wire — an ordered typed `parts[]` array (kills D-3/D-4/D-5/D-6)

A message is **an ordered `parts[]` array, not a text blob** (AI Elements lens). N parts of different types
coexist durably in one turn, rendered in order. Persist per turn in the durable-runtime tables:

| Part type | Renders | Carries audited action? |
|---|---|---|
| `text` | prose (markdown, entity chips inline) | no |
| `reasoning` | Clara's visible thinking, collapsible | no |
| `tool` | activity chip: verb + target + state (streaming→done, expandable I/O) | no — read/act happens in the DB fn, the chip only *reflects* it |
| `attachment` | file chip/thumbnail with live lifecycle status | no directly — *triggers* an ingest run whose status it mirrors |

This single change retires the fenced-JSON-as-protocol regime and its three bugs at once: first-fence-only
(D-4), raw-JSON-in-bubble (D-3), dropped post-fence prose (D-4); makes attachments first-class (D-5); and
makes tool history durable so it survives reload (D-6). **Both extractors emit identical parts (parity-tested).**

### 2.3 The card catalog (the typed vocabulary)

Every card is a developer-authored component filled from a typed DB-read payload. Cards divide into **inline
decision cards** (atomic, ≤2 CTAs, no nested scroll/nav — Apps SDK card discipline) and **workbench surfaces**
(promoted when the object is significant, standalone, iterated, referred-back-to — the Artifacts trigger
heuristic re-fit to accounting). The promotion line: small decisions stay inline chips; heavy, refer-back-to
objects expand into the workbench.

| Card / surface | Kind | Renders when | Carries audited action? | Fixes |
|---|---|---|---|---|
| `je_review` (plan/approve one entry) | inline decision | Clara proposes/edits a single journal entry | **YES** — Approve routes to `approve_entry` fn with expected-revision token; Edit + Reject-with-reason first-class | J-1, D-7, D-12 |
| `clarify` / `account_combo` (choice) | inline decision | Clara is <0.95 or needs a disambiguation; a must-ask fires | no mutation — the answer feeds model context (update-model-context) and may resolve a must-ask object | D-8, C1 |
| `suggestion` / `client_row` | inline chip | proactive finding or navigable entity | no — navigation/read only | D-16 |
| `attachment` lifecycle chip | inline | a file is dropped/pasted/selected | no — mirrors the durable ingest run (uploading→ingested→OCR'd→assigned) | D-5, D-1/E-1 |
| `doc_review` (evidence side-by-side) | workbench surface | reviewing a document-origin entry; the core daily loop | **YES** — "verified against source" IS the approval act; approve carries revision token | **J-18**, A-16/GAP0-1 |
| `plan` / `task` (close, onboarding, batch recode) | workbench surface | any multi-write workflow | **YES** — each step is a governable unit; approve step-or-batch through the audited fn per step | **J-2**, D-16, Grt-1/7 |
| `recon_table` / `match` | workbench surface | bank reconciliation | **YES** — match routes to `match_bank_line` with structural-parity check; **one-click unmatch** (reversible) | GAP1-1/1-2, J-18 |
| `diff` (legs before/after) | inline within edit/history | any edit; before-save; in drawer history | no — review surface; the before/after JSONB already stored and today discarded | **J-3** |
| `export` / `analysis` | workbench surface | client-facing pack or analysis | figures **DB-derived only**; "generate export" is audited, but **no model bytes enter the artifact store**; balance chip is a DB verification result labeled with what it checked | **H-1/H-2/H-4**, H-7/H-8 |
| `verification` / `balance` chip | inline within a card | any figure/statement with a checkable claim | no — DB-derived claim, states what it checked; never a hard-coded `true` | **H-2**, GAP1-1/1-2 |
| `queue` / sweep tray (bulk) | workbench surface | bulk approve/recode across a selection | **YES** — one audited fn per item with maker-checker floors; **per-item summary before firing** | J-5, J-14, V9 |
| `checkpoint` / session-recap | inline | resuming a durable run after restart/wait | no — orients the human ("where we left off: FY2025 close, 3/7 steps, waiting on March bank statement") | Grt-1/7, P8/P12 |
| `why-popover` / KB-rule | inline within a decision | explaining a coding; proposing a learned rule | rule creation is **human-gated**; the rule INFORMS + cites provenance but **never auto-posts below the ≥0.95 gate or bypasses distinct-approver** | J-19/J-21, C3/B |

**v1 minimum reachable set** (confirm the v1 vs v1.1 cut at Gate 2): `je_review`, `clarify`/`account_combo`,
`suggestion`/`client_row`, `tool`, `attachment`, `doc_review`, `plan`/`task`, `export`/`analysis`,
`recon_table`, `diff`, `verification` chip. **No dead vocabulary** — every registered type has exactly one
authoritative emit path and is reachable both live and on reload.

### 2.4 The card lifecycle (kills D-7 structurally)

Every action-carrying card is a state machine whose **authoritative half is always re-derived from the DB on
render** ("authoritative data + UI state = rendered view" — Apps SDK three-tier state as law):

```
drafting/streaming → proposed(needs-action) → { awaiting-approval → approved → executing → posted }
                                             → { denied / dismissed }
                                             → { superseded (edited since emit) }
                                             → { reversed / voided }   (terminal, inert)
                                             → error
```

- A card **never** trusts mount-local React state for actionability (the exact D-7 bug: the old build gated
  the approval card on empty-after-reload mount state). On hydrate it reads live/persisted status; terminal
  states (`posted`, `denied`, `dismissed`, `reversed`) render **inert** — no live Approve button.
- The action button hits the **audited DB fn with an expected-revision token**; if the DB rejects (role
  floor, maker=checker on the high-stakes lane, revision mismatch, <0.95 gate), the card shows the DB's
  reason inline. **The card is the trigger; the DB fn is the authority** (prevents the SDT-001 class — a card
  must never mint an unaudited write).
- Emit-time status is a hint; consequential cards re-read live status on hydrate.

---

## 3. Agentic-workspace surfaces

These are the surfaces over the durable runtime that make the PLAN→SHOW→GATE→VERIFY→RECOVER loop legible.

### 3.1 Plan-as-document (PLAN) — editable, reorderable, approved *before* consequential execution

Every multi-write workflow (period **close**, **onboarding**, opening-balance import, batch recode) opens as
a **plan card / plan document** with ordered steps, each a governable unit showing **what it will post, to
which accounts, with which evidence, at which confidence band, and its full downstream side-effect chain**
(GL legs *and* AR/AP/FA/recon/SST/KB consequences). The human can **edit, reorder, remove, or annotate** a
step before it runs, and approve step-by-step or as a batch (fixes J-1's Approve-only, J-2's missing plan
surface). **Accounting twist:** the side-effect chain per step is mandatory because the North-Star F3 failure
is precisely a plan that posts GL while leaving subledgers stale (C2 makes subledger maintenance intrinsic);
a close plan doubles as a **compliance checklist** mapped to MFRS/MPERS and SST obligations, and as the
durable **audit trail of intent**. Recommend the plan be a **first-class, versioned DB object**, not a
transient UI artifact (carried to Gate 2).

### 3.2 Approvals (GATE) — graduated, boundary-based, DB-owned

Reject both extremes — per-action fatigue and blanket auto. Map the three-tier boundary model (Codex
sandbox-as-boundary / Claude auto-mode tiers) onto **DB-owned write classes**, not model assertions (C3):

- **Tier 1 — flows freely:** reads and reversible draft/evidence preparation. Ungated; may notify after.
- **Tier 2 — reversible, in-scope, post-with-receipt:** routine coding within a client's open period at ≥0.95
  confidence, subledger maintenance intrinsic to the write. **One coherent, stated approval ergonomic** across
  grid / drawer / bulk (fixes the J-5 inconsistency: grid one-key vs drawer-modal vs ungated-bulk). Reversible
  via reverse-not-delete.
- **Tier 3 — consequential / policy-required → plan→review→approve:** tax-affecting, closed-period,
  large-amount, year-end close, opening balances — the **high-stakes lane**. **Distinct-approver is a HARD
  gate** (C4); the agent can **never** satisfy the sign-off; solo firms self-attest on the record.
- **Professional never-auto floor:** always the authorized human, always.

The approval interaction shape borrows `needsApproval → approval-requested → output-available/output-denied`
with **conditional gating on inputs** (amount > threshold, closed-period, tax-affecting), **but the decision
authority lives in the DB**: the client approval calls the audited fn, which independently checks role floor,
maker≠checker on the high-stakes lane, the ≥0.95 gate, and the **expected-revision token** so an approval
after an intervening edit is rejected (the old `approve_entry` had no such token — GAP0-4).

### 3.3 Diffs (VERIFY, part 1) — the diff IS the review surface, and there are two

- **(a) Edit diff (legs before/after):** render a **structured legs-diff** (account/amount/tax changed,
  highlighted) in drawer history, on activity receipts, and *inside the edit sheet before save*. The DB
  already stores before/after JSONB on every history action; the old UI threw it away (J-3). An accounting
  edit *is* a diff; treat it like one.
- **(b) Evidence diff (source document ↔ proposed entry):** the accounting analog of "intent vs code," and
  the single highest-value surface in the rebuild. **Capture per-field evidence regions in the OCR pipeline**
  (Azure DI returns `boundingRegions`/polygons; the old integration discarded them), persist them, and ship an
  **in-drawer side-by-side** viewer with the extracted amount/date/party highlighted on the page, linked from
  every review card, drawer, and inbox item. This is the missing J-18 loop and the physical form of
  "don't trust until verified" (Harvey) + atomic-unit citation (Hebbia per-cell, Glean inline). **"Verified
  against source" IS the approval act.**

### 3.4 Progress + tool-visibility (SHOW) — never a bare spinner

Kill the pulsing "working" dot (J-4). Ship:
- **Honest pre-first-token status line** naming the *actual* tool from a curated honest verb map ("Reading
  invoice_TNB_Apr.pdf…", "Coding 34 of 120 lines…", "Running depreciation for FY2025…") — never "Working…".
- **One breadcrumb chip per tool call** (verb + target + state), streaming `input-streaming →
  input-available`; expandable input/output (formatted JSON), collapsed by default, auto-open on error;
  repetition collapsed ("matched 14 prior TNB bills").
- **A live plan/step checklist** for long jobs that **persists across compaction and restart** — DB-backed,
  not in-memory, so a redeploy mid-close doesn't blank it.
- **Volume legibility:** because AUTO always drafts (autonomy model), the surface must make the split legible
  — **N drafted · N need-you · N auto-posted** — never hidden behind a spinner. Speed *raises* the review
  bar, it does not lower it.

**Tool-call/reasoning history is durable and inspectable** (the `tool_calls`/`artifact` columns that exist and
are never written — Grt-3/9/10): render an expandable per-turn activity trail showing which read fired, which
audited write fn ran with which inputs, which KB pages were injected, which document sha was validated. For a
7-year-retention source of truth this is **evidence, not debug convenience** — reproducible, attributable
(the anti-spoof actor stamp is PORT), and proof that every number came from an audited DB fn (guards the
H-series laundering).

### 3.5 Provenance / evidence viewer (the trust thesis)

The `doc_review` surface is the honesty surface for provenance-at-insert (C3 invariant #2). Trust is
manufactured **structurally**, bound at creation (the cross-product law from `design-agent-coexist.md`):
- **Atomic-unit, region-level citation** — bind each journal-line field (amount, date, counterparty, tax,
  invoice no.) to its exact source span, not document-level.
- **Validate at insert, not display** — the audited write fn validates `source_doc_sha256` ↔ a real
  firm-scoped document row ↔ same client ↔ the cited region exists, or it **fails**. Provenance cannot be
  caller-asserted (fixes A-16/GAP0-1; V1/V8).
- **Side-by-side is the verification loop** — the claim next to its highlighted source; checking is cheaper
  than re-deriving. This is also the anti-injection surface: showing the human the exact region they approve
  is the defense against OCR-borne manipulation (OCR output stays inert data, never an instruction).

### 3.6 Verification lane (VERIFY, part 2) — "in balance" is necessary, not sufficient

A **verification lane distinct from the approval gate**: control-account tie-outs, bank-recon structural
parity (amount/date/account/period — GAP1-1/1-2), balance (Σdr=Σcr), SST leg correctness, subledger-vs-GL
agreement, period-continuity segment checks. **Flag serious-only** (Codex P0/P1 posture): unbalanced,
cross-tenant risk, stale subledger, tax mismatch — don't drown the reviewer. Surface the **reason on every
judgment** (J-19 hides it sr-only; J-21 buries it in the drawer). **The load-bearing law:** a green "in
balance" chip is Clara's "passing test" — necessary, **never sufficient**, **DB-derived**, labeled with what
it checked, **never model-authored** (the old `build_export` hard-coded `balanced:true` — H-2). Every figure
and every verification claim is DB-derived; the reasoning trail *explains*, it never *authorizes*.

### 3.7 Long-running-job status (RECOVER) — durable, resumable, interruptible, background-capable

The UX face of the durable runtime (Cluster A, Grt-1…15):
- **Survive restart:** a close/onboarding mid-flight when the service redeploys must **resume**, not vanish —
  plan-checklist, parked clarification, pending approval, partial postings all DB-backed and re-attachable.
- **Resume days later:** a close paused on a client bank statement resumes when the answer arrives — surfaced
  as an open-question object at client-work-start (C1 must-ask) and via **session recap** on return.
- **Interrupt & steer, keep work-so-far:** stop Clara mid-run to redirect without losing completed, receipted
  steps (Claude's `Esc` model). Define "keep work so far" as *keep completed, receipted steps*; a
  half-finished consequential step must be all-or-nothing at the audited-fn boundary — never a torn write.
- **Heartbeat/staleness on background jobs** (J-6: a dead runner shows a live bar forever): explicit states
  `running / stale "state unknown — runner offline" / done / failed`, periodic refresh — never an eternal
  spinner.
- **Idempotent re-drive** (Grt-11): treat already-approved as success; a restart never re-posts; reflect
  *success*, not a false red FAILED.
- **Isolation per concurrent unit** — firm/client-scoped. Parallel background work across clients must never
  cross tenant boundaries; the isolation that prevents *merge conflicts* for coding agents prevents
  *cross-tenant posting* for Clara, the firm-killing mistake. **Parallelize across independent units**
  (clients/documents/close-steps), **never across competing drafts of one commit** (double-post risk).

### 3.8 Cross-scope attention queue (RECOVER, firm-altitude)

A **cross-scope needs-you** surface (J-28): a blocking clarify in Client A badges a global count + jump list
while the user is in Client B — a clarify **never times out silently**. **State projection** (J-12): one work
item, one DB-owned truth, reflected everywhere — approve in the grid and the rail card self-resolves; no
stale-actionable Approve button anywhere. This is the multi-client analog of Codex's parallel-task list, and
it must be DB-durable so nothing waits invisibly.

---

## 4. Professional-workbench principles

### 4.1 Density with hierarchy — the grid a bookkeeper lives in all day

Dense **but quiet** (Linear lens): neutral chrome, **color reserved for meaning**; ink text on paper-white,
hairline rules; the finance-blue accent and Clara-violet **rationed** to brand/agent moments, never spent on
structural chrome; status and confidence get the only loud color. **Tabular numerals, right-aligned money
columns** (money is `bigint` cents, rendered to RM only in the view — domain law; alignment is legibility and
legibility is trust). Consistent row height, sticky headers, frozen key column (date/entry-id). **Hierarchy by
weight, not boxes** — the old card-in-card density is the anti-pattern. A **density toggle**
(comfortable/compact) whose compact mode still meets the a11y floor.

### 4.2 The command spine — ⌘K (Ask / Do / Go) + object ActionPanels

- **⌘K = dispatch with three verbs.** `Go` = fuzzy jump (client, entry, document, return, account); `Do` =
  run an audited op **or hand a task to Clara as a durable run** (not a chat message that dies on restart);
  `Ask` = query. This is the agent-native command surface. ⌘K is **dispatch, not a chat surface** — "Do"
  *starts* a durable run and hands off to the workbench/Inbox for the plan→approve gate.
- **Object-level ActionPanel** on every focused row (entry, document, reconciliation, FA, return): human verbs
  *and* Clara verbs together, layered `↵` (safe primary — open/inspect) / `⌘↵` (consequential — approve/post,
  **never the reflex key**) / `⌘⇧↵` (tertiary). Type-to-search over actions; power-user aliases.
- **Discoverability + consistency:** `?` reveals all shortcuts; the same key does the same thing everywhere;
  `Esc` always backs out one level; `j/k`/arrows move selection in every list. **Total keyboard operability**
  is both a power-user affordance and an a11y-floor requirement.

### 4.3 Review-queue ergonomics — the List model

The review queue is the heart of the daily loop (Raycast List lens): **always-on fuzzy filter/search**;
**Sections** grouping by the axis that matters (client / status band / confidence lane — the ladder's lanes
map to sections); **right-aligned accessories = trust badges** (`RULE / AUTO / MATCHED` provenance, confidence
band, amount, period, evidence dot — quiet, scannable — "receipts, not claims" in a dense list);
**split-view row↔document with evidence regions** (the J-18 fix, `isShowingDetail` pattern); a **scope
dropdown on the search bar** (period/client); pagination/virtualization; **render-immediately** (queue
skeleton instantly, stream rows — never a blank 60–150s cold-start void).

### 4.4 Period & client context — the scope model

Two firm-killing scope axes: **which client** and **which period**. **Client is top-level scope**, switched
instantly and keyboard-first (⌘K "Go", recents); the **active-scope chip is always visible in composer and
header**, and a write proposed for a different client than the active scope **fails closed** (the guard
against cross-tenant posting — C3 invariant #1). **Period is ambient scope**, always visible, **lives in the
URL** (`?fy=`, `?period=`); **closed periods are a loud, distinct, locked visual state** routed through the
reversal-ordering gate. **SST taxable period is its own scope axis** distinct from the FY (registration date,
assigned bi-monthly cycles, DG variations, s.11(2) 12-month rule — C5); the period selector must express the
SST taxable period where SST work happens, not only the FY.

### 4.5 Trust surfaces — feedback ladder, five screen states, structured references, URL-as-truth

- **Honest feedback ladder** (Raycast Toast lens): three-state toast (success / failure / **animated**
  in-progress → resolved); banner for durable state (period locked, stale context); modal **only** for a true
  decision gate. **Hard invariant: never toast success for an action you have not confirmed happened** — the
  old #1 defect was a "Clara is filing them" ghost success on a fire-and-forget POST that did nothing
  (D-1/E-1). Failure toasts carry the real error + a recovery/undo action.
- **All five screen states designed on every surface:** Empty (guidance, disambiguating done-vs-unstarted) ·
  Loading (skeleton + top progress, render frame instantly) · Error (honest, recoverable, panel-scoped) ·
  Partial (progress, not a lie of completeness) · Ideal (the dense working state, lived most).
- **Structured references both directions** (J-7): row/selection → typed chips carrying `entry_id` /
  `document_id` / filter descriptor / period (not a lossy prose prefix); "Ask Clara about these N" on a
  multi-row selection; Clara resolves ids against live state (fresh context pack, never guesses which entry).
  Agent→workbench: widen the one-verb `filter_journals` channel to a **read-only directive union**
  (`open_view` / `focus_entity` / `apply_filter` carrying period), each an attributed one-click-undo chip
  (J-8). Entity chips render navigable in prose, not only inside cards (J-10). **The read/write asymmetry is a
  safety property:** the agent may freely drive *reads*; it may **never** drive a *write* through that channel
  (SDT-001 is the failure of exactly this asymmetry — keep the agent→UI channel structurally read-only).
- **URL as source of truth** (J-13): mirror tab (`push`) and every filter/band/scope (`replaceState`) into the
  querystring; back/forward always correct; **it is the shared address space between human and Clara** — her
  deep-links and the human's shares resolve to the *same* view.

### 4.6 A11y + perf floors (carried-forward MUSTs, now CI-enforced)

- **Perceptually-uniform, contrast-guaranteed color** (Stripe CIELAB / Linear LCH corroborate the OKLCH
  tokens): derive status/confidence/finance hues so bands read at equal weight and pass contrast **by
  construction**, light + dark. **Never hue-only** — confidence pairs color with shape/label (color-blind
  safety); confidence is a shaped **band, never a raw digit** in the DOM (J-20).
- **Opaque-first perf floor** (J-22 CONFIRMED — the old ⌘K still shipped `backdrop-filter: blur(16px)` with no
  CI gate): opaque L2 overlay (shadow + scrim) for ⌘K and every product surface; precision comes from
  systematic color/contrast, not glass. **Add a CI grep gate** that fails the build on `backdrop-filter` in
  product CSS and on stray `--agent*` tokens outside agent surfaces (the enforcement the old handbook promised
  and never built).
- **A11y floor is a MUST that density never trades away:** WCAG AA contrast, text-resize without breakage,
  target sizes, full keyboard operability, focus management, alt text on evidence regions.

---

## 5. The top design principles (the law that governs every screen)

**DP-1 — Agent-native, one state layer.** Clara is object-level verbs + a shared DB-authoritative context
layer, not a rail. *Test:* remove chat, the workbench still shows what Clara did, why, with what evidence, and
offers her verbs. (Bolt-on is the North-Star failure.)

**DP-2 — Text-to-hydration, never text-to-code.** The model chooses which developer-authored card + which
DB-derived payload + which order; it never authors bytes that render or act on a number. Fail-closed catalog;
parity-tested extractors; no dead vocabulary. (Keeps the H-series shut at the UI layer.)

**DP-3 — The DB owns every number; the card mirrors, the trail explains, neither authorizes.** Every figure,
status, confidence, and verification claim is re-derived from the DB on render and version-pinned. The
reasoning trail explains; it never becomes the authoritative figure. No number without provenance.

**DP-4 — Bind-at-creation, verify side-by-side.** Every consequential claim is bound at creation to its exact
source region, validated at insert (not display), and rendered beside its highlighted source so checking is
cheaper than re-deriving. "Verified against source" is the approval act. (Harvey/Hebbia/Glean law; fixes
J-18, A-16.)

**DP-5 — Graduated, boundary-based, DB-owned authorization.** Reads/drafts flow; consequential boundaries
escalate to plan→review→approve with role floors, maker≠checker on the high-stakes lane, the ≥0.95 gate, and
an expected-revision token — all **DB-enforced**, never model-asserted or client-authored. The card triggers;
the DB disposes. (Rejects both approval fatigue and blanket auto.)

**DP-6 — Legible process, honest state.** Never a bare spinner; never a ghost success. Honest pre-first-token
status, one chip per tool call, durable inspectable tool/reasoning history, live DB-backed checklists, and
volume legibility (N drafted / need-you / auto-posted). Success is asserted only when the DB confirms it.

**DP-7 — Durable, resumable, interruptible, reversible — with the accounting boundary respected.** Runs
survive restart, resume days later, interrupt keeping receipted work, re-drive idempotently, and isolate per
client. **Drafts get checkpoint-grade reversibility (local undo); posted GL entries REVERSE, never REWIND**
(reverse-not-delete is statutory — a "rewind the books" affordance is an accounting-correctness violation).

**DP-8 — Dense but quiet; keyboard-first; opinionated; a11y/perf floors by construction.** Neutral chrome,
color for meaning, tabular money, ⌘K Ask/Do/Go + object ActionPanels, profession-standard vocabulary,
minimal config (the per-client autonomy dial + KB are the only real configuration), opaque-first + perceptual
color enforced by CI, five screen states everywhere, URL-as-truth, typed references both directions.

---

## 6. ADOPT / AVOID mapped to audit findings

### ADOPT

| # | Adopt | Fixes |
|---|---|---|
| AD-1 | Ordered typed `parts[]` transcript (N parts/turn, parity-tested extractors) | D-2, D-3, D-4, D-5, D-6 |
| AD-2 | Fail-closed developer-authored card catalog; text-to-hydration ceiling; no dead vocabulary | D-2, H-1/H-2/H-4 |
| AD-3 | Card lifecycle re-derives authoritative status on hydrate; terminal cards inert; revision token | **D-7**, D-12 |
| AD-4 | Feed in-card edits/answers back into model context (update-model-context boundary) | **D-8** |
| AD-5 | Attachment lifecycle chips mirroring a driven durable run; de-dupe on content hash | **D-5**, D-1/E-1, D-10 |
| AD-6 | `doc_review` side-by-side evidence surface with per-field regions; "verified" = approval | **J-18**, A-16/GAP0-1 |
| AD-7 | Plan-as-document: editable/reorderable, per-step side-effect chain, approve step-or-batch | **J-1, J-2**, D-16 |
| AD-8 | Two diffs: legs before/after **and** source-doc↔entry | **J-3**, J-18 |
| AD-9 | Honest streamed progress: status line + tool chips + DB-backed checklist; ban "working…" | **J-4**, Grt-3/9 |
| AD-10 | Durable inspectable tool/reasoning trail (expandable, repetition collapsed) | Grt-3/9/10, H-1/2 |
| AD-11 | Graduated boundary-based approval → DB write classes + role floors + high-stakes distinct-approver + revision token | **J-5**, C3, C4, GAP0-4 |
| AD-12 | Draft reversibility (discard/rollback/refine-and-rerun); posted = reverse-only | Grt-5, autonomy law |
| AD-13 | Verification lane (tie-outs/parity/balance/SST/continuity); serious-only; reason on every judgment; DB-derived balance chip | **J-19, J-21, H-2**, GAP1-1/1-2 |
| AD-14 | Durable/resumable/interruptible/idempotent runs; heartbeat/staleness; client isolation | Grt-1/5/6/7/11/12, **J-6** |
| AD-15 | Cross-scope needs-you + state projection (one work item, one truth) | **J-12, J-28** |
| AD-16 | Structured references both ways; read-only directive union; entity chips; URL-as-truth | **J-7, J-8, J-10, J-13** |
| AD-17 | Session recap on return to a paused workflow | Grt-1/7 |
| AD-18 | Human-gated KB rules that cite provenance but never lower a gate | C3, B, J-21 |
| AD-19 | ⌘K Ask/Do/Go + object ActionPanels; consequential off the reflex key; `?` discovery; aliases | North-Star, a11y floor |
| AD-20 | Dense-but-quiet grid; perceptual contrast-guaranteed color; opaque-first + **CI grep gate** | **J-22** |
| AD-21 | All five screen states per surface; render-immediately; honest three-state toasts | **D-1/E-1**, cold-start J-findings |
| AD-22 | Always-visible client+period scope; active-scope write-gate; closed-period lock; SST taxable period | C5, cross-tenant |
| AD-23 | Confidence as shaped band pairing color+shape+label; DB-enforced ≥0.95 routing | J-20, C3, GAP0-1 |

### AVOID

| # | Avoid | Why (evidence) |
|---|---|---|
| AV-1 | Text-to-code generative UI anywhere a number is shown/computed/acted on | H-1/H-2/H-4 number laundering — model bytes as DB-authoritative |
| AV-2 | Fenced-JSON-as-protocol; first-fence-only; raw JSON in the bubble; single-artifact-per-turn | D-3, D-4 |
| AV-3 | Gating card actionability on mount-local React state | **D-7** stale-actionable approval cards |
| AV-4 | Client-side approval as the security boundary; ungated `callTool` writes | SDT-001 class; GAP0-4; C3 |
| AV-5 | Fire-and-forget success toasts ("Clara is filing them") | **D-1/E-1** ghost success |
| AV-6 | A read tool that can write (lexical-filter "safety") | pattern #4 SDT-001 — read path must be structurally read-only |
| AV-7 | A single unlabelled green "in balance" chip as the trust signal | **H-2** — balance necessary, not sufficient; never model-asserted |
| AV-8 | Approve-only gates (no Edit, no Reject-with-reason) | **J-1** forces re-runs |
| AV-9 | A "rewind/undo the books" affordance on posted entries | posted GL is statutory; reverse-not-delete only (accounting-correctness violation) |
| AV-10 | Caller-asserted/unvalidated provenance; document-level (not region-level) citation | **A-16/GAP0-1**, J-18 |
| AV-11 | Confidence as a raw digit in the DOM; hue-only status encoding | J-20; a11y/color-blind |
| AV-12 | Invisible bulk actions (no per-item summary); inconsistent approval friction | J-5, J-14 |
| AV-13 | Thread-local / process-local run state | Grt-1, **J-12** — the whole Cluster-A failure |
| AV-14 | Filter/tab state stranded in `useState`; unlinkable modals; Clara deep-linking un-expressible views | **J-13** |
| AV-15 | Label-only prose context; un-attachable multi-selects | **J-7** vibes, not references |
| AV-16 | Live `backdrop-filter`/glassmorphism as a trust cue on daily surfaces | **J-22** perf floor |
| AV-17 | Chat-only surface for high-stakes finance; a chat rail bolted onto a normal dashboard | North-Star pattern #3; Hebbia rejected chat-only |
| AV-18 | Per-action approval fatigue on reversible reads/drafts; blanket auto-mode on consequential writes | trains rubber-stamping / violates never-auto floor C4 |
| AV-19 | Dead card vocabulary; a card catalog whose live and reload renders disagree | D-2 |
| AV-20 | Parallelizing competing drafts of one commit (speculative multi-drafting a single entry) | double-post risk; parallelize across independent units only |
| AV-21 | Configuration mazes; invented jargon; card-in-card density; money as floats/left-aligned | craft/trust (Linear/Figma/Stripe) |

---

## 7. Dependencies & open questions carried to Gate 2

1. **Runtime coupling (decisive).** The durable `parts[]`/tool/interruption/checkpoint/plan-state model this
   direction specifies is only as good as the runtime that persists it (Gate-1 D, open). If the runtime can't
   persist typed parts + interruptions + resumable HITL, the D-4/D-6/D-7/D-8 fixes and every RECOVER surface
   don't land. Feeds the runtime recommendation; C6 adds the DPA-coverable-tracing requirement.
2. **Evidence-region capture is an ingestion requirement, not a UI choice.** The `doc_review`/split-view
   surface (J-18) depends on the OCR pipeline capturing and persisting per-field bounding regions (Azure DI
   `boundingRegions`); the old pipeline discarded them. The design must not promise a surface the backend
   can't feed — flag for the architecture packet.
3. **Plan-as-document persistence.** Recommend the close/onboarding plan be a **first-class, versioned DB
   object** (the intended-vs-actual audit record), not a transient UI artifact. Owner call at Gate 2.
4. **Rewind vs reverse boundary.** Needs an explicit visible UI convention so a draft "rollback" is never
   confusable with undoing a posted entry — an accounting-correctness vs design-ergonomics collision →
   drift-protocol clarify with the owner before building.
5. **Interrupt-keeping-work-so-far semantics.** "Keep work so far" = keep completed, receipted steps; a
   half-finished consequential step must be all-or-nothing at the audited-fn boundary (cross-check the
   co-commit ledger design).
6. **⌘K "Do" scope.** How much can ⌘K hand to Clara before it becomes a second chat surface? Recommendation:
   "Do" *starts* a durable run and hands off to the workbench/Inbox for the plan→approve gate — it dispatches,
   it does not converse.
7. **Verification-lane authorship.** Confirm every verification claim (parity, tie-out, balance) is DB-derived
   and no model prose can enter it (H-series) — a Phase-5 verification-design tie-in.
8. **Design-SoT reconciliation.** The old `docs/design/` catalog + a11y/perf floors are salvage; this
   direction's protocol should be *folded into* the refreshed design SoT, not bolted on. Precedence on any
   collision stays accounting-correctness > backend contract > look/motion.
9. **Density vs a11y floor.** The density toggle's *compact* mode must still meet the a11y floor — never trade
   the floor for density.
