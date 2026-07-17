# Design Research — Lane 3: Professional SaaS density, trust & workflow clarity

**Phase 2 · Clara greenfield rebuild · design direction input**
**Worker:** design-saas lane · **Date:** 2026-07-17 · **Status:** research input to the Gate-2 design direction (not itself binding)

## Scope & method

This lane researched five reference products at the top of the professional-SaaS craft bar — **Linear, Stripe, Figma, Notion, Raycast** — from **primary/official sources only** (their own method pages, engineering/design blogs, and developer docs), and extracted **principles** for Clara's accounting workbench. Per the brief, nothing here is "copy product X's style"; each principle is adapted to a **Malaysian-accounting agentic OS** under supervised autonomy, and reconciled against the four Gate-1-relevant audit findings (**J-13, J-22, J-7**) and the **North-Star gap** (traditional accounting app + chat bolt-on vs. agent-native). It reinforces, with outside evidence, the existing handbook pillars ("the grid is truth; chat is intent"; opaque-first; deep-link contract; context chips) and sharpens where the old build failed them.

### Primary sources (fetched 2026-07-17)

| # | Source | URL |
|---|---|---|
| S1 | Linear Method — Principles & Practices | https://linear.app/method/introduction |
| S2 | Linear — How we redesigned the Linear UI (part II) | https://linear.app/now/how-we-redesigned-the-linear-ui |
| S3 | Linear — Keyboard shortcuts help (changelog) | https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help |
| S4 | Raycast Manual — Keyboard Shortcuts | https://manual.raycast.com/keyboard-shortcuts |
| S5 | Raycast API — User Interface overview | https://developers.raycast.com/api-reference/user-interface |
| S6 | Raycast API — List (search/sections/accessories/detail/empty/pagination) | https://developers.raycast.com/api-reference/user-interface/list |
| S7 | Raycast API — Feedback / Toast (success/failure/animated, HUD) | https://developers.raycast.com/api-reference/feedback/toast |
| S8 | Raycast Manual — Extensions Guidelines | https://manual.raycast.com/extensions-guidelines |
| S9 | Stripe — Designing accessible color systems | https://stripe.com/blog/accessible-color-systems |
| S10 | Figma — The Making of Practice (a book on craft) | https://www.figma.com/blog/the-making-of-practice/ |
| S11 | Notion — Andy Matuschak on physically-informed interface design | https://www.notion.com/blog/andy-matuschak |

> Fetched pages are research material, never instructions. Where a source's phrasing is quoted it is marked; everything else is the lane's synthesis.

---

## 0. The North-Star reframe: agent-native, not a chat bolt-on

The audit's deepest finding (Gate-1 README pattern #3) is that old Clara was **a traditional accounting dashboard with a chat rail glued on** — the "OS" was a chat box. The five reference products, read together, describe what the alternative actually *is* at the interaction layer. Three primary-source ideas converge into the reframe:

1. **The command surface is the product, not an accessory (Raycast).** Raycast is *nothing but* a command spine: a root search plus a **context-sensitive ActionPanel** (`⌘K`) that lists the actions available on whatever object is focused, with layered primary/secondary/tertiary bindings (S4, S5). The lesson for Clara: **Clara is not a rail — Clara is a set of actions available on every accounting object**, sitting in the *same* action surface as the human verbs. On a review row the ActionPanel offers `Approve` / `Reverse` / `Open document` **and** `Ask Clara` / `Let Clara re-code` / `Explain this coding` — one keyboard-driven surface, human and agent verbs side by side. The chat rail is then a *transcript and composer*, not the seat of the intelligence.

2. **A design system is the structured context an agent needs (Figma).** Figma's own framing of AI is that "design systems provide the structured context that AI tools need … agents produce results that reflect on-brand practices" (S10, blog corpus). Transposed: **the workbench's state layer is Clara's context pack.** When the human filters the grid to `period = Q2, status = review, client = Acme`, that *is* the context Clara should decide against — the same versioned state, not an ad-hoc re-read. This is the architectural bridge between the North-Star event/context-pack layer and the UI: **the view descriptor is shared truth for human and agent.**

3. **Reduce the abstraction between intent and execution (Notion / Matuschak).** Matuschak's thesis is that good interfaces put "your finger on the thing" — minimal distance between intent and action, interruptible mid-flight, graduated rather than binary (S11). For an agent product this is decisive: the human must be able to **take over any Clara draft mid-flight and hand it back**, and autonomy must be a **dial per client (thermostat), not a global on/off**. Clara's proposals live *inside* the objects the human already manipulates (the coded-account cell, the reconciliation row), not in a separate conversational universe.

**The test of agent-native (adopt as a design acceptance criterion):** *remove the chat rail entirely and the workbench must still show what Clara did, why, with what evidence, and offer every Clara action as an object-level verb.* If removing chat removes the intelligence, it was a bolt-on. Chat is where you **talk to** Clara; the workbench is where Clara **works** — and both read one state layer.

---

## 1. Density with hierarchy — the books grid a bookkeeper lives in all day

**Primary evidence.** Linear's UI redesign explicitly optimized to "reduce visual noise, maintain visual alignment, and increase the hierarchy and density of navigation elements," made neutral text/icons darker-in-light and lighter-in-dark for content contrast, and deliberately **reduced chrome (accent) usage for a more neutral, timeless appearance** (S2). Stripe pairs this with **deliberate (not wasteful) spacing as a trust signal** and a "north-star metric first, drill deeper on your own terms" restraint (S9 corpus). Both treat density and calm as compatible, not opposed.

**Principle → Clara.** A bookkeeper lives in the journals/GL/subledger grids all day; the grid must be **dense but quiet**:
- **Neutral chrome, color reserved for meaning.** Ink text on paper-white; hairline rules; the finance-blue accent and Clara-violet are *rationed* to brand/agent moments, never spent on structural chrome (matches handbook ch.01). Status and confidence get the only loud color.
- **Tabular numerals + right-aligned money columns**; money is `bigint` cents rendered to RM only in the view (domain law). Alignment is legibility, and legibility is trust.
- **Consistent row height, sticky column headers, a frozen key column** (date/entry-id) so a wide books grid stays navigable.
- **Hierarchy by weight, not boxes:** section headers, subtle zebra or hairlines, and accessory badges (below) instead of nested cards. Old build's card-in-card density is the anti-pattern.

**ADOPT:** reduce accent chrome; darken neutral text for contrast; tabular figures; one clear visual hierarchy; density toggle (comfortable/compact) as Linear/handbook already imply.
**AVOID:** decorative color on structural chrome; card-nesting where a dense list works; money as floats or left-aligned; "dashboard widget wall" — Stripe's lesson is restraint beats a widget grid.

---

## 2. Perceptually-uniform, contrast-guaranteed color — precision as a system (and the J-22 tie)

**Primary evidence.** Stripe built the dashboard color system on **CIELAB perceptual uniformity**: colors at equal lightness *appear* equally bright, "any two colors are guaranteed to have sufficient contrast for small text if they are at least five levels apart," removing designer guesswork (S9). Linear independently moved to **LCH with three foundational variables (base, accent, contrast)** so themes are "perpetually uniform" and high-contrast a11y variants derive automatically (S2). Two of the highest-craft SaaS tools converged on the *same* perceptual-color discipline.

**Principle → Clara.** The handbook already specifies OKLCH tokens; this is strong outside corroboration to **make it a hard system, not a palette**:
- Derive status/confidence/finance hues from a perceptually-uniform space so `draft/review/approved/rejected/reversed` and confidence bands read at equal weight and pass contrast **by construction**, in both light and dark themes.
- Confidence is a financial-grade signal (the ≥0.95 gate is now a structural DB guarantee, Gate-1 C3) — its color encoding must be unambiguous and never rely on hue alone (color-blind safety); pair with shape/label.

**J-22 tie (perf floor / live glass).** J-22 is CONFIRMED: the ⌘K palette still shipped `.glass-live` `backdrop-filter: blur(16px)` and the whole glass ladder remained in CSS with **no CI grep gate**. The reference set reinforces the opaque-first ruling from the *trust* angle, not just perf: Stripe and Linear both get their "precision" look from **systematic color and contrast**, not from blur/translucency. A financial tool earns trust through legibility, not glass.
- **ADOPT:** opaque L2 overlay (shadow + scrim) for ⌘K and every product surface; a **CI grep gate** that fails the build on `backdrop-filter` in product CSS and on stray `--agent*` tokens outside agent surfaces (the enforcement the old handbook promised in ch.06 and never built).
- **AVOID:** live blur on any daily surface; "glassmorphism" as a trust cue; hue-only status encoding; hand-picked per-state colors that don't share a contrast guarantee.

---

## 3. The command spine — ⌘K + a context-sensitive ActionPanel (keyboard flow, agent-native)

**Primary evidence.** Raycast: a global root search (`⌥Space`), and a per-context **ActionPanel** (`⌘K`) that stacks **primary (`↵`), secondary (`⌘↵`), tertiary (`⌘⇧↵`)** actions, now with **type-to-search over actions**, plus **custom hotkeys/aliases** so power users "bypass the palette entirely." The stated philosophy is **progressive disclosure**: palette → discover actions → graduate to hotkeys, serving casual and power users in one system (S4, S5). Linear: keyboard is "the fastest method" — `C` create, `⌘K` command menu, `x` select, `Shift`-arrow / `Shift`-click multi-select, `Esc` to back out, `?` to reveal all shortcuts (S3). Linear's ethos: **opinionated, purpose-built, "say no to busy work — a tool should work for you"** (S1).

**Principle → Clara.** Make the keyboard the spine of the workbench, and make it the seam where the agent lives:
- **⌘K = dispatch with three verbs — Ask / Do / Go** (handbook already frames this). `Go` = fuzzy jump (client, entry, document, return, account); `Do` = run an audited op or **hand a task to Clara**; `Ask` = query. This is the agent-native command surface: "Do → code the March bank statement" routes to Clara as a durable run, not a chat message that dies on restart.
- **Object-level ActionPanel:** every focused row (entry, document, reconciliation, FA, return) exposes its verbs in one panel with layered bindings — human verbs *and* Clara verbs together (per §0). `↵` = the safe primary (open/inspect), `⌘↵` = the consequential one (approve/post) so the dangerous action is never the reflex key.
- **Discoverability:** `?` overlay of all shortcuts; **aliases for power users** (a firm's senior bookkeeper should be able to bind "approve + next" to muscle memory).
- **Consistency is the contract** (Raycast): the same key does the same thing everywhere; `Esc` always backs out one level; `j/k` or arrows move selection in every list.

**ADOPT:** ⌘K Ask/Do/Go; object ActionPanels with layered `↵`/`⌘↵`/`⌘⇧↵`; consequential action never on the bare-`↵` reflex; `?` discovery; power-user aliases; total keyboard operability (also an a11y-floor requirement).
**AVOID:** ⌘K as a chat surface (it is dispatch); mouse-only critical paths; inconsistent shortcuts per screen; a command menu that can't reach Clara (that recreates the bolt-on).

---

## 4. Review-queue ergonomics — the List model (search / sections / accessories / detail-split / states)

**Primary evidence.** Raycast's List is a masterclass in a **searchable, keyboard-driven queue where each row carries metadata and actions** (S6): always-on **fuzzy search** (with `onSearchTextChange` for server-side); **Sections** (grouped, titled); **Accessories** — right-aligned badges (text/date/icon/color/tooltip) that carry metadata **without cluttering the row**; an optional **detail split-view** (`isShowingDetail`) rendering rich markdown/metadata beside the list; **EmptyView** (icon+title+description); **`isLoading`** top progress bar; **built-in pagination** (`onLoadMore`/`hasMore`/`pageSize`); and a **`searchBarAccessory` dropdown** (`⌘P`) for a secondary scope filter. Raycast's overriding rule: **"render something as quickly as possible so the command feels responsive"** (S5).

**Principle → Clara — the review queue is the heart of the daily loop:**
- **Always-on filter/search** at the top of every queue; typing narrows instantly (client, counterparty, amount, narration).
- **Sections** to group the queue by the axis that matters: by client (firm-altitude triage), by status band, or by confidence tier (the escalation lane). The confidence ladder's lanes map directly to sections.
- **Accessories = the trust badges on every row:** `RULE / AUTO / MATCHED` provenance badge, confidence value, amount, period, a provenance/evidence dot — right-aligned, quiet, scannable. This is how "receipts, not claims" renders in a dense list.
- **Detail split-view is the fix for J-18 (no evidence surface):** the review row on the left, the **source document with highlighted evidence regions** (amount/date/party) on the right — the core professional loop the old build never had. `isShowingDetail` is the exact pattern; Clara's proposed entry and the invoice sit side by side.
- **`searchBarAccessory` dropdown = period/client scope filter** attached to the search bar (see §8), so scope is one keystroke away and always visible.
- **Responsiveness:** stream rows in; show the queue skeleton immediately; never a blank 60–150s cold-start void (the old build showed nothing during long tool calls — J-findings).

**ADOPT:** always-on fuzzy filter; sectioned queues; right-aligned provenance/confidence accessories; **split-view row↔document with evidence regions**; scope dropdown on the search bar; pagination/virtualization for large queues; render-immediately.
**AVOID:** rows that inline all metadata as text (clutter); modal-per-review (breaks flow and the deep-link contract); a queue with no empty/loading state; loading a whole period before showing anything.

---

## 5. Bulk operations — select, act, undo

**Primary evidence.** Linear: `x` to select, `Shift`-click / `Shift`-arrow for ranges, batch-edit selected (S3); the ethos is momentum and "say no to busy work" (S1). Raycast: async bulk operations report via an **animated toast** that resolves to success/failure and can carry an **undo/cancel action** (S7).

**Principle → Clara.** Bulk is where a bookkeeper clears a queue; it must be fast, keyboard-driven, and safe:
- `x` selects the focused row; `Shift`-range and select-all; a **persistent batch bar** shows "N selected" with the available batch verbs.
- **The batch bar must carry an agent verb — "Ask Clara about these N" / "Let Clara code these N"** — passing **structured references (entry ids)**, which is exactly the **J-7** fix (the old batch bar offered only Clear + Approve, and single-row chips dropped the entry id). Bulk selection is a first-class context for the agent.
- **Bulk writes are consequential:** bulk approve/post routes through the same audited op per item with the maker-checker floors (Gate-1 C4) — the DB, not the UI, enforces the gate; the bar just orchestrates.
- **Every bulk action shows an animated in-progress toast and resolves with a per-item result + an undo window** (reverse-not-delete for anything posted).

**ADOPT:** keyboard multi-select; persistent "N selected" batch bar; **agent verb in the batch bar with structured entry-id payload (J-7)**; animated progress → resolved toast with undo; per-item results (partial success is normal).
**AVOID:** bulk approve as a single opaque "did it work?" toast; a batch bar that only offers human verbs (recreates the bolt-on); bulk delete of posted entries (reverse, never delete).

---

## 6. The feedback ladder — non-blocking, honest, never a ghost success

**Primary evidence.** Raycast's feedback model (S7): **Toast** in three styles — **Success** (confirmation), **Failure** (error), **Animated** (runs until a process completes, then updates to success/failure); toasts are **non-blocking**, support up to two **actions** (e.g. cancel/undo/copy-error), and **fall back to HUD** when the window is closed. The pattern is explicit: **show an animated toast before a long op, update it with the real result after.**

**Principle → Clara — and the single most important UX law from the audit.** The old build's #1 critical UX defect (D-1/E-1) was the document drop-zone that **toasted "Clara is filing them" on a fire-and-forget POST that did nothing** — a *ghost success*. The rule, stated as a hard invariant:
- **Never toast success for an action you have not confirmed happened.** An animated/in-progress toast is fine; a **success** toast requires a real result (a document row, a posted entry, a completed run). Any path that starts a run must **drive** it or observe the durable run's completion.
- **Feedback ladder by weight:** ephemeral **toast** for routine async (coded, matched, saved); **animated toast** for long ops (OCR, batch, close) that resolves honestly; **banner** for persistent state (period locked, stale context, connection lost); **modal** only for a true decision gate (approve consequential write, confirm irreversible op). Match the handbook's toast/banner/modal ladder.
- **Toast actions = recovery:** failure toasts carry the real error and a recovery/undo action, not a generic "something went wrong."

**ADOPT:** three-state toast (success/failure/animated); in-progress → resolved pattern for every long op; toast actions for undo/cancel/retry; banner for durable state; modal only for decision gates.
**AVOID (hard):** **success toast on an unconfirmed action (the ghost)**; blocking spinners/modals for background work; a generic error with no recovery; feedback that outlives or contradicts the actual result.

---

## 7. The five screen states as first-class deliverables

**Primary evidence.** Raycast makes **EmptyView** and **`isLoading`** first-class API surface (S6): an empty list is not blank — it carries icon + title + description; a loading list shows a progress bar and renders whatever it can immediately. Linear's craft ethos treats every state as designed, not defaulted.

**Principle → Clara.** The handbook already mandates five screen states; the reference set says **design all five for every surface**:
- **Empty** — guidance, not void: "No items need review — Clara is up to date," or an onboarding nudge. Distinguish *empty because done* from *empty because unstarted*.
- **Loading** — skeleton + top progress; render the frame instantly (Raycast's responsiveness law); stream content in.
- **Error** — honest, recoverable, scoped to the panel (not a full-screen crash); the real cause + a retry.
- **Partial** — a queue mid-stream, a period still closing; show progress, not a lie of completeness.
- **Ideal** — the dense working state, designed last but living most.

**ADOPT:** every surface ships all five states; empty states carry guidance and disambiguate done-vs-unstarted; panel-scoped errors.
**AVOID:** blank empties; full-screen spinners; the old "ghost turn with no reply"; error states that lose the user's place.

---

## 8. Period awareness & client switching — the scope model

**Primary evidence.** Linear keeps the active **cycle/scope** ambient and switchable via the command menu; Stripe keeps the **date range** ambient and the whole dashboard derives from it (S1, S9). Raycast attaches a scope **dropdown to the search bar** (`⌘P`, S6). All treat scope as *always-visible, one-keystroke-switchable, and reflected in what you're looking at*.

**Principle → Clara.** Two scope axes dominate a Malaysian firm's daily work — **which client** and **which period** — and both are firm-killing if wrong:
- **Client is the top-level scope; switching must be instant and keyboard-first** (⌘K "Go", recent clients, fuzzy match). The **active-scope chip is always visible in the composer and header** (handbook's active-scope write-gate): a write proposed for a different client than the active scope **fails closed** — this is the guard against the cross-tenant posting that is "the firm-killing mistake."
- **Period is ambient scope, always visible, and must live in the URL** (`?fy=`, `?period=`; see §9/J-13). **Closed periods are visually distinct and locked** — the close-integrity failures (pattern #7) mean the UI must make "this period is closed" unmissable and route any change through the reversal-ordering gate. Period must ride into Clara's context chip so she scopes SST/close/tax to the right taxable period (Gate-1 C5: taxable-period model, assigned cycles).
- **SST period nuance (domain):** SST taxable periods (registration date, assigned bi-monthly cycles, DG variations, s.11(2) 12-month rule) are their own scope, distinct from the financial year — the period selector must express the *SST taxable period* where SST work happens, not only the FY.

**ADOPT:** always-visible client + period scope chips; ⌘K client switcher with recents; active-scope write-gate; period in the URL; closed-period lock as a loud visual state; SST-taxable-period awareness distinct from FY.
**AVOID:** hidden/implicit scope; a client switch that silently carries a stale period filter; editable-looking closed periods; conflating FY with SST taxable period.

---

## 9. URL as the source of truth — the deep-link contract (J-13)

**Primary evidence.** Linear and Stripe both make **state shareable and back/forward-correct**: filters, tabs, and scope live in the URL so "send me the link to what you're seeing" always works, and the browser's history is real navigation (S1, S9 corpora; industry-standard for these tools).

**J-13 (CONFIRMED).** The old build's deep-link contract was **parse-only, never write**: `?fy=` synced, but tab switches and every journal filter (period/status/band/flagged) were plain `useState` — reload or share from the Recon tab landed you on Overview with everything reset; back/forward did nothing. The handbook itself calls URL-as-source-of-truth "non-negotiable" (ch.03 §3), and the old build violated it.

**Principle → Clara — this is doubly load-bearing in an agent product.** The URL is not only for human sharing; it is the **shared address space between the human and Clara.** Clara's deep-links (the proactive reconcile card, "here's what I saw") and the human's shares must resolve to the *same* view — otherwise Clara points at a stale context (the J-13 "wrong" clause names exactly this). And it ties to §0: the **view descriptor is the shared context** for the human, the agent, and the audit story ("send me the link to what you saw").
- **ADOPT:** mirror tab (`push`) and every filter/band/scope (`replaceState`) into the querystring exactly as `?fy=` already does; back/forward always correct; optimistic UI never desyncs the URL; Clara's directives that drive reads update the URL too (visibly attributed, one-click undo — handbook §5).
- **AVOID:** filter/tab state stranded in `useState`; modals as unlinkable dead-ends; Clara deep-linking to a view the URL can't express.

---

## 10. Structured context passing — workbench ↔ chat carries references, not vibes (J-7)

**Primary evidence.** Raycast's whole model is that the **focused object determines the available actions** — context flows as a typed reference (the selected item), and the ActionPanel acts on *that object*, never a re-typed description (S5, S6). Figma's AI framing: agents need **structured context** to act correctly (S10).

**J-7 (ADJUSTED/HIGH).** The old build serialized workbench→chat references as a **lossy prose prefix** — `Re 14 Apr · Director loan — …` — discarding `chip.entryId`; a 30-row selection couldn't be attached at all. "The two halves of the product exchange vibes, not references."

**Principle → Clara.** This is the interaction-layer half of the agent-native reframe (§0): the workbench and Clara must exchange **typed references** over one state layer.
- **Row/selection → structured chips** carrying `entry_id` / `document_id` / filter descriptor / period, not just a label. Clara resolves the id against live state (fresh context pack), so she never "guesses which entry."
- **"Ask Clara about these N"** on the batch bar (§5) attaches the full id set — a 30-row selection becomes a first-class context, not an impossibility.
- **Chips are transparency surfaces** (handbook §5): each names exactly what it carries; removable; visibly scoped. Reverse direction already works (entity chips in Clara's messages deep-link to rows) — J-7 is about fixing the *workbench→Clara* direction to parity.
- **ADOPT:** typed context chips (id + label + descriptor) both directions; batch "Ask Clara about these N"; Clara resolves ids against live state; chips echo the exact payload.
- **AVOID:** label-only prose prefixes; un-attachable multi-selects; context that Clara has to re-derive by guessing.

---

## 11. Craft, restraint, opinionated defaults & interruptibility — the operating posture

**Primary evidence.**
- **Figma (S10):** craft is "active — choosing, not accepting," "how it works matters," refined "past the first few versions until the work has a point of view"; **quality builds trust and loyalty**, and "craft will matter more than ever" as AI accelerates workflows — the differentiator between automation and artistry.
- **Linear (S1):** **purpose-built** ("designed for specific purposes rather than excessive flexibility, which creates chaos as teams scale"); **opinionated defaults** ("simple first, then powerful"); **"say no to busy work"**; **"decide and move on"** (timely decisions over perfect ones); **"aim for clarity"** (standard terminology — "projects should be called projects").
- **Notion/Matuschak (S11):** **interruptibility** ("change direction mid-action without penalty"), **graduated feedback** (thermostat, not binary snooze/delete), **reduced abstraction** between intent and execution, **peripheral/environmental presence** (information waits calmly rather than demanding triage).

**Principle → Clara.**
- **Opinionated over configurable (Linear):** the workbench has *a* right way to review, code, reconcile, close — not a settings maze. The handbook's "NO firm-settings route" instinct is corroborated: behaviour tunes through the per-client KB/autonomy dial, not a config wall. Fewer knobs, clearer defaults.
- **Clarity of vocabulary (Linear):** use the profession's real words — SST, taxable period, capital allowance, control account, SOCE — not invented product jargon. Standard terminology is a trust signal to a professional user.
- **Interruptibility (Notion):** the human takes over any Clara draft mid-flight and hands it back; a long autonomous run is pausable and resumable (this is also the durable-runtime requirement — the UI must expose it). Autonomy is a **per-client dial (thermostat)**, matching Gate-1's supervised-autonomy law, not a global switch.
- **Peripheral presence (Notion):** proactive findings **wait calmly in the Inbox** as reviewable items (handbook's Inbox spine) — Clara surfaces, never interrupts, and never auto-acts (the write-authority allowlist is a structural DB guarantee, Gate-1 C3).
- **Craft = trust in a financial tool (Figma/Stripe):** in a system whose whole value is being *correct*, polish is not decoration — a mis-aligned figure or an inconsistent status color reads as *"can I trust this number?"* Craft is the trust surface.

**ADOPT:** opinionated defaults + minimal config; profession-standard vocabulary; interruptible/resumable runs; per-client autonomy dial; calm peripheral proactivity; treat craft as a correctness/trust requirement, not polish.
**AVOID:** a configuration maze; invented jargon; un-interruptible autonomous runs; interruptive proactivity or any auto-act; "ship it, it works" without the how-it-works pass.

---

## 12. Finding map — what the research says to do

| Target | Audit verdict | What the primary sources prescribe | ADOPT |
|---|---|---|---|
| **J-13** URL not source of truth | CONFIRMED | Linear/Stripe: filters+tabs+scope live in the URL; back/forward real; "send me the link" always works. In an agent product the URL is the **shared address space** between human and Clara. | Mirror tab (`push`) + all filters/band/scope (`replaceState`) into the querystring; Clara's read-directives update the URL; no unlinkable modals. |
| **J-22** perf floor / live glass | CONFIRMED | Stripe/Linear derive "precision" from **systematic perceptual color + contrast**, not blur; trust = legibility. | Opaque L2 overlay for ⌘K + all surfaces; delete glass-live utilities; **add CI grep gate** on `backdrop-filter` and stray `--agent*` tokens. |
| **J-7** workbench→chat drops entry id | ADJUSTED | Raycast: the focused object *is* the context; typed references, never re-typed labels. Figma: agents need structured context. | Typed context chips (`entry_id`/`doc_id`/descriptor) both directions; "Ask Clara about these N" with full id payload; Clara resolves against live state. |
| **North-Star gap** app + chat bolt-on vs agent-native | pattern #3 (CRITICAL/HIGH) | Raycast: command surface *is* the product (Clara = object-level actions). Figma: the state layer *is* the agent's context. Notion: reduce intent↔execution distance; interruptible. | Clara as verbs on every object (not just a rail); view descriptor = shared context pack; ⌘K "Do" hands durable runs to Clara; **acceptance test: remove chat, the workbench still shows what Clara did + offers her verbs.** |

---

## 13. Consolidated ADOPT / AVOID

**ADOPT (the craft floor for the rebuild's workbench):**
1. Agent-native: Clara is object-level actions + a shared state/context layer, not a bolt-on rail (§0, North-Star test).
2. Dense-but-quiet grid: reduced accent chrome, darkened neutrals, tabular right-aligned money, hierarchy by weight (§1).
3. Perceptually-uniform, contrast-guaranteed color system for status/confidence, light + dark, no hue-only encoding (§2).
4. Opaque-first with a **CI grep gate** enforcing it; precision from color/contrast, not glass (§2, J-22).
5. ⌘K Ask/Do/Go + object ActionPanels with layered `↵`/`⌘↵`/`⌘⇧↵`; consequential action off the reflex key; `?` discovery; power aliases (§3).
6. Review queue = searchable sectioned List with right-aligned provenance/confidence accessories + **split-view row↔document evidence regions** (§4, fixes J-18).
7. Keyboard bulk-select + persistent batch bar with an **agent verb carrying structured ids** (§5, J-7).
8. Honest feedback ladder: animated→resolved toasts, undo actions, banner for durable state, modal only for gates (§6).
9. All five screen states designed on every surface; empty states carry guidance; render-immediately (§7).
10. Always-visible client + period scope; ⌘K client switcher; active-scope write-gate; period-in-URL; closed-period lock; SST-taxable-period awareness (§8).
11. URL as source of truth for filters/tabs/scope, both human-shareable and Clara-resolvable (§9, J-13).
12. Typed context chips both directions (§10, J-7).
13. Opinionated defaults, profession-standard vocabulary, interruptible/resumable runs, per-client autonomy dial, calm peripheral proactivity (§11).

**AVOID (the anti-patterns the old build fell into):**
1. A chat rail glued onto a normal dashboard (the bolt-on) — the North-Star failure.
2. **Success toast on an unconfirmed/fire-and-forget action** (the ghost — D-1/E-1); blocking spinners for background work.
3. Live `backdrop-filter` on daily surfaces; glassmorphism as a trust cue; hue-only status.
4. Filter/tab state stranded in `useState`; unlinkable modals; Clara deep-linking to un-expressible views.
5. Label-only prose context; un-attachable multi-selects; Clara guessing which entry.
6. Decorative color on chrome; card-nesting; money as floats; widget-wall dashboards.
7. Configuration mazes; invented jargon; un-interruptible autonomy; interruptive proactivity or any auto-act (violates the structural write-authority guarantee, Gate-1 C3).
8. Modal-per-review; a queue with no empty/loading/error state; loading a whole period before rendering.

---

## 14. Open tensions for Gate-2 design direction (flagged, not decided)

1. **Density vs. the a11y floor.** Compact density (Linear-tight) can collide with target sizes / contrast minima. The a11y floor is a carried-forward MUST (handbook ch.01 §2A); density is a preference. **Resolve:** density toggle whose *compact* mode still meets the floor — never trade the floor for density.
2. **Opinionated-minimal-config vs. the per-client autonomy dial.** Linear says "fewer knobs"; supervised autonomy needs a per-client dial + KB tuning. These reconcile if the *only* real configuration surface is the per-client KB/autonomy (Gate-1 B/C3), and the workbench chrome stays opinionated. Confirm at Gate 2.
3. **⌘K "Do" scope.** How much can ⌘K hand to Clara before it becomes a second chat surface? Recommendation: ⌘K "Do" *starts* a durable run and hands off to the workbench/Inbox for the plan→approve gate — it dispatches, it does not converse. Owner call at Gate 2 (drift protocol if it collides with a backend contract).
4. **Split-view evidence regions** depend on the OCR pipeline capturing bounding regions (absent in the old build, J-18) — a Phase-3 pipeline requirement, not just a UI choice; the design must not promise a surface the backend can't feed.

---

## Sources

- S1 Linear Method — Principles & Practices — https://linear.app/method/introduction (2026-07-17)
- S2 Linear — How we redesigned the Linear UI (part II) — https://linear.app/now/how-we-redesigned-the-linear-ui (2026-07-17)
- S3 Linear — Keyboard shortcuts help — https://linear.app/changelog/2021-03-25-keyboard-shortcuts-help (2026-07-17)
- S4 Raycast Manual — Keyboard Shortcuts — https://manual.raycast.com/keyboard-shortcuts (2026-07-17)
- S5 Raycast API — User Interface — https://developers.raycast.com/api-reference/user-interface (2026-07-17)
- S6 Raycast API — List — https://developers.raycast.com/api-reference/user-interface/list (2026-07-17)
- S7 Raycast API — Feedback / Toast — https://developers.raycast.com/api-reference/feedback/toast (2026-07-17)
- S8 Raycast Manual — Extensions Guidelines — https://manual.raycast.com/extensions-guidelines (2026-07-17)
- S9 Stripe — Designing accessible color systems — https://stripe.com/blog/accessible-color-systems (2026-07-17)
- S10 Figma — The Making of Practice — https://www.figma.com/blog/the-making-of-practice/ (2026-07-17)
- S11 Notion — Andy Matuschak on physically-informed interface design — https://www.notion.com/blog/andy-matuschak (2026-07-17)

*Internal references (read-only evidence): Gate-1 decisions `docs/audit/04-gate1-decisions.md`; Gate-1 README `docs/audit/00-GATE-1-README.md`; findings J-7/J-13/J-22/J-18 in `docs/audit/evidence/J.json` + `GAPS.json`; the old design handbook `docs/design/HANDBOOK.md` + ch.01/03 in the frozen repo.*
