# Clara — Product Design

> **Skeleton + pointer, per the owner's Q7-B ruling (harness refactor, 2026-08-12): real content
> lands at Wave G** ("the OS surface" — proactive inbox, ⌘K Ask/Do/Go + ActionPanels,
> plan-as-document, exports UI, generative-UI completion, the design floors — see
> `docs/ARCHITECTURE.md`'s "Roadmaps" section and
> `PROGRESS.md` for the live Wave-G scope). Phase 4 (Waves A–F) builds the product's accounting
> engine under the seed direction below; this file is where the **product design** — the
> object model surfaced to a user (Clients, Documents, Entries, Periods, Reports as first-class
> navigable objects, not just chat), the information architecture, the ⌘K command surface, and
> the plan-as-document pattern for close/onboarding — gets written up as a real, standalone
> charter once Wave G builds it. Until then, this file exists so the doc tree has a stable home
> for it and nothing gets improvised ad hoc into a random location.

## What will live here at Wave G

- The two-pane Agentic Accounting OS object model: what's a first-class object (client,
  document, entry, period, report), what's a view over one, what's chat-only.
  ⌘K Ask/Do/Go semantics and the ActionPanel catalog for each object type.
- Plan-as-document: the versioned, intended-vs-actual audit record for close/onboarding runs
  (adopted disposition in the seed direction below, §2.3) — the real schema and surface once
  built.
- The proactive inbox + cross-scope needs-you surface (allowlisted wakes) and how they compose
  with the object model above.
- Cross-references into `docs/design/DESIGN_SYSTEM.md` (the visual/component vocabulary that
  implements this) and `docs/design/FRONTEND.md` (the stable UI contracts + verification approach).

## Primary sources for the Wave-G write-up

The four primary-source research lanes behind the seed direction, kept as reference material
(principles extracted and adapted, never style-copied):

- `docs/phase2-research/design-direction-synthesis.md` — the normative synthesis the seed
  direction below adopts wholesale (the two-pane thesis, typed `parts[]`, the fail-closed card
  catalog, DP-1…DP-8, AD-1…AD-23 / AV-1…AV-21).
- `docs/phase2-research/design-genui.md`
- `docs/phase2-research/design-agentic.md`
- `docs/phase2-research/design-saas.md`
- `docs/phase2-research/design-agent-coexist.md`

---

## Current direction (seed)

> Carried in verbatim from the former `docs/design/PRODUCT_DESIGN.md` (retired at the 2026-08-12
> harness docs-tree refactor — this file supersedes it as the home for product design). Ratified
> at Gate 2 (2026-07-17) and still the live seed direction for Phase 4 build; its own "what Phase
> 4 builds first" status table (§4) reads as of the F6–F9 close (2026-08-09) and will go stale as
> later waves land — cross-check against `PROGRESS.md` for
> current build status. Nothing in this reproduced section has been edited.

# Clara — Design Direction (Rebuild, adopted)

*The design source of truth for the rebuild, superseding the old `docs/design/` set. Status: **RATIFIED** — adopted at Gate 2, which closed 2026-07-17 (the ADR-013 era). Date: 2026-07-17.*

## 1. The normative document

**`docs/phase2-research/design-direction-synthesis.md` is adopted as the normative design direction** — the two-pane Agentic Accounting OS thesis, the typed `parts[]` transcript wire, the fail-closed card catalog (text-to-hydration, never text-to-code), the card lifecycle that re-derives authoritative status on hydrate, the PLAN→SHOW→GATE→VERIFY→RECOVER surfaces, the professional-workbench principles (⌘K Ask/Do/Go, density-with-hierarchy, scope model, URL-as-truth), the eight design principles **DP-1…DP-8**, and the full ADOPT (AD-1…AD-23) / AVOID (AV-1…AV-21) lists mapped to audit findings. It was synthesized from four primary-source research lanes (`design-genui.md`, `design-agentic.md`, `design-saas.md`, `design-agent-coexist.md` — principles extracted and adapted, never style copied).

**The agent-native acceptance test governs every surface:** *remove the chat rail — the workbench must still show what Clara did, why, with what evidence, and offer every Clara action as an object-level verb.*

Precedence on any collision remains **accounting-correctness > backend contracts > design look/motion**, with the drift protocol (clarify with the owner) on look-vs-contract conflicts.

## 2. Orchestrator dispositions on the synthesis's open questions

| # | Question (synthesis §7) | Disposition |
|---|---|---|
| 1 | Runtime coupling | **Resolved conditional on Gate-2 ratification + the Slice-0 spike** — the recommended runtime (AI SDK 7 + WDK, `ARCHITECTURE.md` §4.0) natively persists typed parts, interruptions, and resumable HITL; the D-4/D-6/D-7/D-8 fixes and the RECOVER surfaces land on it (or on the LangGraph fallback behind the same seam). |
| 2 | Evidence-region capture | **Adopted as an ingestion requirement** — `ARCHITECTURE.md` §7. The design never promises a surface the backend can't feed. |
| 3 | Plan-as-document persistence | **Recommended: a first-class, versioned DB object** (the intended-vs-actual audit record). → **Gate-2 owner ratification.** |
| 4 | Rewind vs reverse boundary | Drafts get local undo ("discard draft"); posted entries expose **only** Reverse-with-reason; the two affordances are visually and verbally distinct (never a shared "undo" verb). Accounting-correctness rules here; flagged to the owner at Gate 2 per the drift protocol. |
| 5 | Interrupt semantics | Adopted: "keep work so far" = keep completed, receipted steps; a half-finished consequential step is all-or-nothing at the audited-fn boundary. |
| 6 | ⌘K "Do" scope | Adopted: "Do" **dispatches** a durable run and hands off to the workbench/Inbox for the plan→approve gate — it never converses. |
| 7 | Verification-lane authorship | Adopted as law: every verification claim is DB-derived; no model prose enters the lane. Tied into the Phase-5 verification design. |
| 8 | Old design-SoT salvage | The old catalog's fail-closed parser + a11y/perf floors are PORT and folded in; the fenced-JSON protocol and glass ladder are DROP (per the salvage manifest). |
| 9 | Density vs a11y | Adopted: compact mode must still meet the a11y floor — the floor never trades away. |

## 3. Build-time enforcement the design demands (CI gates)

- **Card-catalog parity test** — live-render and hydrate-render extractors must agree, or the build fails (kills the D-2/D-4 class).
- **No dead vocabulary** — every registered card type must have exactly one authoritative emit path and a reachability test.
- **Opaque-first grep gate** — the build fails on `backdrop-filter` in product CSS and stray agent-only tokens outside agent surfaces (J-22). **(DEMANDED–NOT-BUILT, trued 2026-09-02: no such gate exists in apps/web's lint chain — rides the P6 polish wave.)**
- **A11y floor checks** — contrast (OKLCH tokens contrast-guaranteed by construction), keyboard operability, focus management; confidence always shape+label, never hue-only or a raw digit.
- **Honest-state lints** — no success toast without a confirmed outcome; terminal cards render inert. **(DEMANDED–NOT-BUILT, trued 2026-09-02: not in the lint chain — rides the P6 polish wave. The other three gates on this list ARE live: catalog parity, reachability, the a11y floor.)**

## 4. What Phase 4 builds first (design-critical path)

Status marks read as of the F6–F9 close (2026-08-09): ✅ built · ◐ part-built · – not yet.

1. ✅ The typed `parts[]` transcript + tool chips + attachment lifecycle chips (the streaming spine).
2. ✅ `je_review` + `clarify` + `doc_review` (side-by-side evidence with region overlays) — the daily loop.
3. ✅ The review queue (List model: sections, fuzzy filter, trust-badge accessories, split-view).
4. ◐ Plan-as-document for close/onboarding — the ONBOARDING half is built (`/clients/plan`); the CLOSE half rides Wave E. *(trued 2026-09-03: `/clients/plan` is the dashboard-era route — in apps/web the capability is the in-thread `OnboardingChecklistCard.tsx`/`InterviewRunCard.tsx`, rated SAME in `dashboard-web-capability-diff-2026-09-02.md:135`; the close half is ALSO built — `apps/web/app/(firm)/clients/[clientId]/close/page.tsx` + `apps/web/components/close/ClosePlanPanel.tsx` reading `get_close_plan` (landed #364, 2026-08-27) — with one residual: the "Clara proposes close" adopt surface, named as an honest not-built note in the page itself.)*
5. ◐ ⌘K Ask/Do/Go + object ActionPanels; URL-as-truth wiring *(trued 2026-09-02: the palette IS built in apps/web — Go navigates live, Ask hands off to the Clara rail, Do is a deliberate disabled placeholder; object ActionPanels remain unbuilt)*.
6. – The verification lane + diffs (legs before/after; doc↔entry).
