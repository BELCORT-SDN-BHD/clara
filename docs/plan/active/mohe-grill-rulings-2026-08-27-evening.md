# 磨合 grill — evening batch rulings (2026-08-27)

*Owner rulings from the evening grill session (Tao, in-session, 2026-08-27). This file
complements `mohe-grill-rulings-2026-08-27.md` (whose numbering Q1-Q9 is already cited
in code); this batch is numbered **R1-R7** to avoid collision. Each ruling names its
execution owner and window.*

## R1 — Brand: the product is ClaraBook; the Ledger Fold mark is adopted

The **platform's user-facing name is ClaraBook**; **Clara remains the agent persona**
(the AI accountant the user converses with); the repo/codebase name `clara` is unchanged.
The **Ledger Fold** mark (finished exports in clarabook-frontend
`g3-identity/g3-2/exports/`) is ADOPTED as the platform logo, paired with the ClaraBook
wordmark. *Execution: asset port + product-name copy pass, pre-P6 polish item. This
closes the silent brand gap the handoff-conformance audit flagged.*

## R2 — `--identity-canvas` founder note GRANTED, entry pages only

The cream ground `--identity-canvas` (#F7F6F2) is approved as the page ground for
**auth/entry surfaces only** (login, signup, invite-accept) — the founder-approved impact
note the token contract §3.3 requires. Work pages (tables, numbers) stay on white
`--background`. *Execution: P4 auth surfaces; record the note verbatim in the
`globals.css` citation block; add the cream-ground text pairs to the contrast gate.*

## R3 — Focus indicator: unify on the shadcn ring (a founder amendment of §9)

All focus indicators unify on the **shadcn 3px translucent ring**
(`focus-visible:ring-3 ring-ring/50`), superseding contract §9's 2px #1D4ED8 outline.
This is a **founder amendment of the ratified contract** — a §9 recut PR is owed to
clarabook-frontend. *Execution: one global pass replacing the §9 outline treatment;
the contrast gate re-derives the focus-ring pairs as the ring's COMPOSITED effective
colour, including on the R2 cream ground — if the ring fails 3:1 there, that is an
R2×R3 collision to surface back to the owner, never a unilateral fix.*

## R4 — UI primitives: build-on-demand confirmed

Primitives are vendored via the shadcn CLI **as each surface needs them**, passing the
token/a11y gates in the same PR — never pre-built from the component matrix into dead
inventory. The two philosophy substitutions stand as house state law: **StateBanner over
Toast, prose state copy over skeletons.**

## R5 — Mobbin MCP into the repo config

Approved: add the Mobbin MCP server to the repo's `.mcp.json` (next PR), making the
handoff's "ground every NEW product flow in a Mobbin reference first" rule discoverable
by every future lane, not just this session.

## R6 — The admin-floor law for the clocked lane (wrapper 13's parked question)

**Option A**: the clocked lane may **draft/propose** admin-floor material (reversible,
receipted — e.g. a prepayment amortisation schedule), but **establishing/signing stays a
human act at its ADMIN floor; no floor is ever lowered for the agent.** Same logic as the
law-71 HIGH-1 ruling: preparation is agent-lawful, signature is human — an admin floor is
just a higher-ranked signature. *Execution: design law for F-A4 PR-2, where wrapper 13
unparks (two live-writer core extractions via a D1 window + the `clara.documents`
service-period column). The owner also confirmed PR-2 may sprint in parallel with P4.*

## R7 — F-A7b onboarding form: in-thread interview, not wizard pages

Client onboarding's primary form is the **Clara in-thread interview** (the F-A7 wake
surface already built), with a **structured progress checklist card** rendered as parts
alongside the thread. The prototype's five separate wizard pages
(`/onboarding/*`, `/opening`, `/seeding`) are **superseded** — a recorded divergence from
the handoff, not a gap.
