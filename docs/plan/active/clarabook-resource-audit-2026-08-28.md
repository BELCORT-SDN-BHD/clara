# ClaraBook handoff resource audit — consumption verified (2026-08-28)

*Run to answer the owner's standing question with a measurement: "does apps/web respect
EVERY resource the clarabook-frontend handoff provided — design system, rules, philosophy,
skills, tech stack — including things we never enumerated?" Two-pass verification lane
(`claude-sonnet-5`): pass 1 = the five core design-rule docs + PR #1 body + the repo tree
vs the apps/web tree at the T0 frontier; pass 2 = the remaining prescriptive docs
(`00_FRONTEND_DESIGN_PROGRAM.md` · the FD-001..FD-047 decision log · `EMIL-CRAFT-AUDIT.md` ·
`SCREEN-FLOW-SPEC.md` · ~17 qa/ audit files), hunting one class only: a binding rule our
records never cite. Every row below is a positive read (file:line or command output).*

**Verdict: apps/web consumes the handoff with unusually high discipline** — byte-cited
provenance, deviations recorded rather than silently absorbed. One binding-rule delta
(owner question, §4), two identity-asset gaps dispositioned (§3).

## §1 CONSUMED (evidence held at file:line)

Token contract, every semantic role (`apps/web/app/globals.css` cites
`01-TOKEN-CONTRACT.md` at its commit) · brand fonts via `next/font/local` + licenses ·
shadcn/Base-UI base-nova with documented init provenance · Emil motion discipline
(per-utility `prefers-reduced-motion` arms matching contract §7; dedicated P3 polish
passes) · all 8 Emil skills tracked in-repo · shadcn MCP pinned in `.mcp.json` · Mobbin
MCP as live grounding practice (`p4-mobbin-grounding-2026-08-28.md`,
`mobbin-grounding-wave-2026-08-28.md`) · next-intl with the Q5 statutory scoping · the
WCAG gate set (`apps/web/test/a11yRules.test.ts` · keyboard walks · the strict token
contrast gate) · the handoff-boundary house laws restated in `apps/web/AGENTS.md` ·
light-only beta scope. Pass 2 additionally verified `EMIL-CRAFT-AUDIT.md`'s three craft
rules hold (no `transition-all`; ⌘K deliberately skips decorative dialog motion — arrived
at independently via the vendored `animate` skill; mascot motion rules moot pending §3.1)
and that `SCREEN-FLOW-SPEC.md`'s governance rules ("governed acts never execute from
chat text") restate what typed-parts + text-to-hydration already enforce structurally.

## §2 DIVERGED-BY-RULING (all on file)

Port-drift self-corrections ("PORT DRIFT, CONFORMED" comments in `globals.css`) · the
focus ring (R3, unified on shadcn — §9 founder amendment) · `--identity-canvas` scoped to
entry faces only (R2 + 裁-2) · WCAG bar formally 2.1 AA not 2.2 (Q7 — but see §4) · the
stale integration manifests superseded (Q1; `codex-frontend-handoff-errata-2026-08-27.md`).

## §3 The two identity-asset gaps — DISPOSITIONED 2026-08-28

1. **Clara mascot assets — was genuinely unrecorded; now recorded.** The token contract
   §7 gives the mascot strict motion rules (empty-state/rare-welcome only, never a
   loader); no asset exists in `apps/web/public/` and no ruling covered the omission.
   **Disposition: P6 polish-wave scope** (裁-3 tier (c) identity flourishes), surfaced to
   the owner in the next batch — the owner may also rule the mascot OUT of the product;
   until ruled, it is an owed P6 item, not a silent drop. *(Ledger Fold, the audit's other
   asset flag, was already OWED: R1's execution note + 裁-3(c) — pre-P6, on file.)*
2. **The `ClaraBook*` public component-naming convention
   (`05-FRONTEND-HANDOFF-BOUNDARY.md` §8) — as-conducted ruling: NOT BINDING.** The house
   adopted domain-folder organization (`components/bank/`, `components/close/`, …) through
   P2/P3's reviewed builds; handoff conformance binds at the token/pattern/a11y/motion
   level, not the export-naming level. Recorded here so the gap closes as documentation.

## §4 The one binding-rule delta — OWNER QUESTION (batched, non-blocking)

**WCAG 2.2 SC 2.5.8 target-size (24×24 px) is mandated twice by the source design system**
(`01-TOKEN-CONTRACT.md` §5.2's dedicated `--target-min` token, "spacing exceptions must be
documented"; `SCREEN-FLOW-SPEC.md:894` "target-size … gates are mandatory") **and is
untested in apps/web** (zero hits in the a11y rule set). Q7's ruling set the formal bar at
WCAG **2.1** AA — and 2.5.8 is a 2.2-only criterion — but Q7 never names target-size, and
its density trade-off was the reason for declining AAA, not for dropping a criterion the
contract anticipates with its own documented-exception mechanism.
**Recommendation: adopt at P6** — add a target-size check to `apps/web/test/a11yRules.ts`
in the polish wave, honouring the contract's documented-exception mechanism for dense
surfaces, rather than reading Q7's 2.1 downgrade as an implicit drop. **Fail-closed
default until ruled: treat as owed at P6.** The alternative ruling (out of scope under
Q7) is one sentence and makes it DIVERGED-BY-RULING.

## §5 Honest bounds + one instrument lesson

Pass 2 read the prescriptive docs in full and grep-scanned the qa/ narratives for binding
language with full context on every hit; the ~15 qa files are prototype-specific defect
narratives imposing nothing on apps/web beyond Q1's settlement. Not every one of the
handoff repo's 1408 files was read — the sweep covered everything that prescribes.
Instrument lesson (the audit's own false headline, corrected in-flight): a stale shared
main checkout produced "apps/web does not exist on main" — the absence-from-the-
wrong-instrument class; the checkout was fast-forwarded and the finding withdrawn.
