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
  deliberate decision. *(Trued 2026-09-02: this route list is the DASHBOARD era's — in
  `apps/web` the equivalents live under `(firm)/clients/[clientId]/…` (bank/registers/close)
  and `/aging`, `/assets`, `/clients/plan` have no apps/web route; per the Pointer section,
  apps/web's actual route tree governs.)*
- **States** — for each surface: loading, empty, error/refused (honest-state lints already
  require no success toast without a confirmed outcome and inert terminal cards — this file
  would be where that convention is written down and enumerated per surface, not just enforced
  ad hoc in review), populated, and any surface-specific states (e.g. a stale context-pack
  token forcing a re-fetch).
- **Verification** — how each contract above actually gets checked: the card-catalog parity
  test (live-render vs hydrate-render extractors must agree — currently enforced as a CI gate
  per `docs/design/PRODUCT_DESIGN.md` §3 build-time enforcement, not documented here yet), the a11y floor
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

The outgoing dashboard package is `apps/dashboard` (Next.js on Cloudflare Pages,
`app.clarabook.com`) — still what is DEPLOYED until the P6 cutover PR. **`apps/web` is the
source of truth for frontend behaviour**: it is on `main` (not a branch), carries P1–P3 plus
the whole port wave, and replaces `apps/dashboard` at cutover. Until this file is populated,
read `apps/web`'s code and its `README.md`, not a spec. See
`docs/plan/active/port-wave-plan-2026-08-28.md` for the cutover plan and
`docs/plan/active/frontend-handoff-2026-08-23.md` + its 08-24 addendum for the original
handoff. *(Trued 2026-08-29, P-4 of `docs/plan/active/mohe-alignment-audit-2026-08-29.md`:
this pointer named the branch `frontend/web` and called `apps/dashboard` "the only source of
truth for current frontend behavior". This file's own emptiness stays scheduled — owner
ruling Q7-B, Wave G.)*
