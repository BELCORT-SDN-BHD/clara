# Clara — Frontend

> **Skeleton + pointer, per the owner's Q7-B ruling (harness refactor, 2026-08-12): real content
> lands at Wave G.** This file's job, once populated, is the stable-UI-expectations contract:
> for each shipped surface, what states it can be in, what the interaction contract is, and how
> that contract gets verified — not a restatement of the design direction (that's
> `docs/design/PRODUCT_DESIGN.md`) or the visual vocabulary (that's `docs/design/DESIGN_SYSTEM.md`).

## What will live here at Wave G

- **Stable UI expectations per surface** — for each shipped object surface (the review queue,
  `je_review`, `clarify`, `doc_review`, `/bank`, `/aging`, `/assets`, `/clients/plan`, and
  whatever Wave G adds), the contract a caller/tester can rely on not changing without a
  deliberate decision.
- **States** — for each surface: loading, empty, error/refused (honest-state lints already
  require no success toast without a confirmed outcome and inert terminal cards — this file
  would be where that convention is written down and enumerated per surface, not just enforced
  ad hoc in review), populated, and any surface-specific states (e.g. a stale context-pack
  token forcing a re-fetch).
- **Verification** — how each contract above actually gets checked: the card-catalog parity
  test (live-render vs hydrate-render extractors must agree — currently enforced as a CI gate
  per `docs/ARCHITECTURE.md` §3 build-time enforcement, not documented here yet), the a11y floor
  checks, and whatever visual/e2e verification Wave G adds. This file is where "verified" gets
  defined precisely enough to test against, rather than asserted in prose.

## Why this is empty on purpose

The product's UI surfaces are real (see the pointer below) but their contracts currently live
only as CI gates and scattered PR review conventions, not as a single authored reference. Wave
G ("the design floors") is where that gets consolidated, once the object model in
`docs/design/PRODUCT_DESIGN.md` and the token/component system in
`docs/design/DESIGN_SYSTEM.md` are far enough along that a frontend contract document has
something stable to describe.

## Pointer

The dashboard package is `apps/dashboard` (Next.js on Cloudflare Pages, `app.clarabook.com`).
Until this file is populated, its shipped routes and components are the only source of truth
for current frontend behavior — read the code, not a spec. **apps/web** (branch
`frontend/web`) replaces `apps/dashboard` at cutover; see
`docs/plan/active/frontend-handoff-2026-08-23.md` + its 08-24 addendum.
