# Clara — Design Direction (Rebuild, adopted)

*The design source of truth for the rebuild, superseding the old `docs/design/` set. Status: Phase-2 adopted direction, for Gate-2 ratification. Date: 2026-07-17.*

## 1. The normative document

**`docs/phase2-research/design-direction-synthesis.md` is adopted as the normative design direction** — the two-pane Agentic Accounting OS thesis, the typed `parts[]` transcript wire, the fail-closed card catalog (text-to-hydration, never text-to-code), the card lifecycle that re-derives authoritative status on hydrate, the PLAN→SHOW→GATE→VERIFY→RECOVER surfaces, the professional-workbench principles (⌘K Ask/Do/Go, density-with-hierarchy, scope model, URL-as-truth), the eight design principles **DP-1…DP-8**, and the full ADOPT (AD-1…AD-23) / AVOID (AV-1…AV-21) lists mapped to audit findings. It was synthesized from four primary-source research lanes (`design-genui.md`, `design-agentic.md`, `design-saas.md`, `design-agent-coexist.md` — principles extracted and adapted, never style copied).

**The agent-native acceptance test governs every surface:** *remove the chat rail — the workbench must still show what Clara did, why, with what evidence, and offer every Clara action as an object-level verb.*

Precedence on any collision remains **accounting-correctness > backend contracts > design look/motion**, with the drift protocol (clarify with the owner) on look-vs-contract conflicts.

## 2. Orchestrator dispositions on the synthesis's open questions

| # | Question (synthesis §7) | Disposition |
|---|---|---|
| 1 | Runtime coupling | **Resolved** — the recommended runtime (AI SDK 7 + WDK, `ARCHITECTURE.md` §4.0) natively persists typed parts, interruptions, and resumable HITL; the D-4/D-6/D-7/D-8 fixes and the RECOVER surfaces land on it. |
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
- **Opaque-first grep gate** — the build fails on `backdrop-filter` in product CSS and stray agent-only tokens outside agent surfaces (J-22).
- **A11y floor checks** — contrast (OKLCH tokens contrast-guaranteed by construction), keyboard operability, focus management; confidence always shape+label, never hue-only or a raw digit.
- **Honest-state lints** — no success toast without a confirmed outcome; terminal cards render inert.

## 4. What Phase 4 builds first (design-critical path)

1. The typed `parts[]` transcript + tool chips + attachment lifecycle chips (the streaming spine).
2. `je_review` + `clarify` + `doc_review` (side-by-side evidence with region overlays) — the daily loop.
3. The review queue (List model: sections, fuzzy filter, trust-badge accessories, split-view).
4. Plan-as-document for close/onboarding.
5. ⌘K Ask/Do/Go + object ActionPanels; URL-as-truth wiring.
6. The verification lane + diffs (legs before/after; doc↔entry).
