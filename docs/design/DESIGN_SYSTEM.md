# Clara — Design System

> **Skeleton + pointer, per the owner's Q7-B ruling (harness refactor, 2026-08-12): real content
> lands at Wave G.** **No documented design system exists yet.** Phase 4 has shipped real UI
> surfaces (the review queue, `je_review`/`clarify`/`doc_review`, `/bank`, `/aging`,
> `/assets`, `/clients/plan`, and more — see `apps/dashboard`) but they were built directly
> surface by surface, with no separately authored token set, component library, or pattern
> documentation behind them. **The as-built dashboard is the only truth about Clara's current
> visual language** — read the code in `apps/dashboard`, not a spec, if you need to know what
> Clara looks like today.
>
> **[TRUED 2026-08-23] The "built against shadcn/Tailwind primitives" clause was FALSE and is
> removed.** At the bytes, `apps/dashboard/package.json` declares exactly four dependencies —
> `next`, `pdfjs-dist`, `react`, `react-dom` (plus type/TS devDeps) — and **no `tailwind*` or
> `shadcn*` package or config exists anywhere in the tree**. The surfaces are **plain CSS
> Modules**. Nothing was built on a design system that was never installed. **The Codex frontend
> build decides the system** (owner ruling 2026-08-23: the new app package lands in this repo on
> its own branch and replaces `apps/dashboard` at cutover), so a token set adopted here now would
> be superseded before it was used.

## Why this is empty on purpose

`docs/design/PRODUCT_DESIGN.md` (formerly DIRECTION.md) is a *direction*
document — principles, precedence rules, what to build first — not a component/token
specification. Nothing has yet extracted the shipped surfaces' actual tokens (color, spacing,
type scale), component variants, or interaction patterns into a reusable system. That
extraction is real design-system work, scoped to Wave G ("the design floors" — see
`docs/ARCHITECTURE.md`'s "Roadmaps" section and
`PROGRESS.md` for the live Wave-G scope) once enough of the product surface exists to
generalize from, rather than being guessed ahead of the surfaces that will use it.

## What will live here at Wave G

- The token set actually in use (extracted from `apps/dashboard`'s Tailwind config + shadcn
  theme, not invented fresh) — color (OKLCH, contrast-guaranteed per the seed direction's a11y
  floor), spacing, type scale.
- The component inventory: which shadcn primitives are used as-is, which are customized, and
  the Clara-specific compositions (trust-badge accessories, confidence bands, evidence-region
  overlays, tool chips, the card catalog).
- The card-catalog protocol's visual contract (fail-closed rendering, hydrate-vs-live parity —
  the mechanism is `docs/adr/`/`docs/ARCHITECTURE.md`; this file would own its visual
  half).
- Motion and state conventions (honest-state lints: no success toast without a confirmed
  outcome, terminal cards render inert — currently enforced ad hoc per surface, not documented
  centrally).

## Pointer

Until Wave G, treat `apps/dashboard` as the design system: its shadcn/Tailwind setup and the
shipped surfaces are the ground truth. `docs/design/PRODUCT_DESIGN.md` governs precedence and
principles; this file governs nothing yet.
