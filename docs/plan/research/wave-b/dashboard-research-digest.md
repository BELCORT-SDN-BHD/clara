# Dashboard-lanes research digest (4-angle web sweep, 2026-07-24)

Four parallel research lanes (sonnet-5 xhigh, web-grounded, primary-source discipline);
full digests with per-claim URLs in the workflow record (`wf_10058304-a88`). This file
carries the decision-relevant findings + the adoptions folded into the plan draft.

## Angle 1 — agent-driven onboarding/interview UX (verified-primary heavy)

- Park-for-a-human as a first-class durable primitive (hook token valid across days,
  zero compute while parked) is the converged architecture — Vercel WDK docs, Temporal
  HITL guidance. **Validates the v25 interview build exactly as shipped.**
- Temporal: the UI queries durable NAMED state ("awaiting approval", "approved by X"),
  never execution internals — the progress surface renders truthfully across crashes.
- Non-silent expiry: a timed-out park applies a defined fallback visibly attributed to
  "system", never a silent drop (Vercel moderation HITL pattern).
- Intercom Fin: the handoff artifact is a STRUCTURED PACKET (what was understood, data
  gathered, why it stopped, recommended next act) — never a transcript dump; a human
  re-doing agent work = the packet failed. **The plan-as-document IS this packet.**
- GitHub PR "Viewed" tick-list: ticking (personal progress) is mechanically separate
  from approving (a distinct submission); a tick auto-clears if content changes under
  it. **Validates keeping D4's tick ceremony verbally/visually distinct from approval.**
- Conversation design: explicit echo-back for low-confidence or high-stakes answers;
  implicit confirmation folded into the next question otherwise. **Intake of statutory
  identifiers is high-stakes ⇒ the shipped explicit echo-back is right.**

## Angle 2 — HITL review/approval in agentic fintech (approval-fatigue evidence)

- Approval fatigue is MEASURED: ~93% rubber-stamp rate on permission prompts
  (Anthropic telemetry); the fix is routing by risk so the human queue holds only
  judgment-worthy items + reviewing coherent units, never more granular gates.
- Batch law: homogeneous+independent only; a mismatched item grays out with its own
  reason — never silently blocks or passes the rest. **The BatchApprove doctrine and
  the DB's per-item outcomes already encode this.**
- Evidence-first review is table-stakes: source-doc + extracted-field side-by-side with
  per-FIELD provenance highlighting (click a figure → its region lights up).
- Confidence NEVER as a raw score — qualitative bands tied to system validation state
  + a plain-language rationale. **House law already (shape+label, never hue/digit).**
- High-stakes single approvals: a positive-acknowledgment CHECKLIST (intent, evidence
  lineage, blast radius, reversal path) beats a bare Approve button. **ADOPTED for the
  D3 K5 ceremony UI — see the plan.**
- Maker-checker floor: distinct-actor enforced at the system level + a visible audit
  trail. **Clara enforces both in the DB; the workbench renders them.**

## Angle 3 — agentic-OS surfaces (the category state of the art)

- Linear agent sessions: an explicit run state machine (pending/active/awaitingInput/
  error/stale/complete) surfaced as a status chip + typed Activity entries instead of a
  raw chat log. **ADOPTED for the interview panel's state chip + thread rendering.**
- Plan-as-artifact convergence (Claude Code, Cursor, Devin, Windsurf, Copilot): the
  plan is a durable, ADDRESSABLE, editable object with per-step status — never chat
  prose. **ADOPTED: the plan view is a PAGE (`/clients/[id]/plan`, URL-as-truth).**
- Generative-UI safety converged industry-wide (Google A2UI + Vercel AI SDK): typed
  catalog, agent picks WHICH not HOW — external precedent for the house text-to-
  hydration law.
- Palette = a dispatcher onto registered object verbs (cmdk action-as-object), never a
  freeform executor. **Existing ⌘K law.**
- Competitive note: the AI-native ERPs nearest Clara (Campfire, Puzzle, Rillet) show no
  public dedicated plan/evidence/review surface distinct from embedded copilots — the
  typed-catalog maker-checker workbench is ahead of the visible category.

## Angle 4 — streaming transcripts + citations

- AI SDK v5 typed parts[] (text / tool-* with a 4-state enum / reasoning / source-* /
  data-*) is the concrete industry mirror of Clara's parts law; tool chips are
  state-enum-driven, never string-sniffed.
- SSE/Redis stream-resume is for sub-30s transport glitches ONLY — multi-day parking
  rides the durable substrate + a state snapshot read. **Validates the v25 design:
  GET /state is the resume surface; the stream is a live nicety.**
- Citations as structured, span-anchored annotations kept SEPARATE from prose (OpenAI
  Deep Research schema); Perplexity-style layered disclosure (compact chip → hover
  preview → sources rail). **ADOPTED for wiki-citation chips in review cards.**
- Long-running background agents converge on a per-run progress card independent of
  chat, with intervene/kill verbs on the card. **The interview panel + autodraft
  receipts already follow this shape.**

## Adoptions folded into the plan draft (v0.2)

1. D3's K5 approve ceremony = a positive-acknowledgment checklist (tie document + sen
   deltas seen · maker≠checker identity · blast radius: N entries post at as_of ·
   correction path = supersede verb) with the serializable one-txn framing explicit.
2. The plan view is an addressable page `/clients/[id]/plan` (resolves draft Q4).
3. The interview panel: explicit state chip (awaiting_you / parked / cancelled /
   complete), section progress, typed Activity-thread rendering, echo-back retained.
4. Wiki/provenance citations render as layered-disclosure chips on review cards.
5. Confirmed-as-is: BatchApprove per-item independence, severity-sectioned lint queue,
   no raw confidence scores, plan-as-structured-packet, /state-snapshot resume.
