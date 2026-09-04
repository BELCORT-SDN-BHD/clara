# ADR-0077 · The beta pivot: a paid launch at RM0, tax inert at launch, the cutover re-scoped, the G1 clocks deferred, and the review leg under Codex

**Date:** 2026-08-31 · **Status:** standing — **SIGNED by the owner 2026-08-31 evening (裁-93)**
(this entry minutes rulings the owner already gave in the dated ledgers; the digest's own law
says additions land as ADR entries and the digest is re-trued when one does).
**Source ledgers:** `docs/plan/active/mohe-grill-rulings-2026-08-30.md` (裁-57 · 58 · 62 · 72) and
`docs/plan/active/mohe-grill-rulings-2026-08-31.md` (the 2026-08-31 direction; 裁-73 … 裁-84).

## Decisions minuted

1. **Beta is a PAID launch; there is no invited-free tier** (裁-57). "Invite" in every earlier
   ruling means RBAC membership into a paying firm. The tier-3 self-serve gate is exactly three
   walls + payment: DPA e-sign at signup · the registration rate wall · the email-bound admission
   token · **Stripe checkout success IS the approval** (裁-68). No operator queue for tier-3.
2. **Every plan is RM0 until the pricing sitting** (裁-58): checkout runs in subscription mode at
   a zero-amount price, the card collected, nothing charged; the UI renders "Beta 试用期 / trial",
   never "RM0"; `amounts_ruled=false` and `issue_invoice` refuses until the amounts are ruled.
3. **The firm-creation path** (裁-73): Stripe Checkout → a signature-verified, idempotent webhook
   → one `firm_admissions` row → the existing `create_firm`; an unpaid signup parks on the holding
   page with a resume-checkout control, is never deleted and sends no reminder (裁-74). The
   self-serve tenant-creation door takes its own design gate + security review (R8, 2026-08-26).
4. **Tax is inert at beta** (裁-62): no issued tax artifacts; the thirteen treatment codes stay
   unsigned; Track B's build is paused (裁-80) and its UI is an honest IA shell. PRD §4 item 12 /
   §9.4's "F-T3 ALL-IN for Wave F" is amended by a dated pause note; the law (§6) is unchanged.
5. **The cutover scope** (裁-72 as amended by 裁-75): the 2026-08-28 census is re-run on a live
   catalog first; the domain switch waits for the measured residual + dated honest notes and for
   the interview runner's `apps/web` home (裁-78) — not for the P6-C1…C7 trains.
6. **The G1 clocks are post-beta** (裁-76, amending 裁-59): Wave G's criterion is the interactive
   agentic product; the three-switch ceremony follows with real traffic.
7. **The seat stays in the Claude Code session; lanes are chosen by fit** (裁-82 as amended the
   same day by 裁-85 — the `orchestrator-fable` philosophy: the most effective, suitable and
   economical model that does not sacrifice quality; a family that is out is substituted, builds
   included). Stripe's account-level objects are created from DB rows through this session's
   Stripe connector, TEST mode first; lanes build the code with keys env-to-env only (裁-81 →
   裁-87).
8. **The lean review ladder** (裁-84 as amended by 裁-86): ONE fresh-context opus read-only review
   per code PR, the same reviewer re-verifying the fold; **law 28 is KEPT** — the Codex-build /
   opus-review split is the cross-model pass, and a native-built money/auth/webhook/tenant-creation
   surface adds a Codex read-only leg; **every frontend train walks its journey in a real browser
   (Playwright) on the built app**, the axe scan riding the walk *(AMENDED by 裁-192, owner,
   2026-09-04: the smoke walk on the built app is ALSO a required per-PR CI job under the `ci`
   meta-gate — gate and acceptance, no longer acceptance only; digest row 99)*. ADR-061's uniformity is
   unchanged. *(裁-84's cross-session reading and the orchestrator's dissent to it are moot.)*
9. **A reduced Wave G stays in front of beta** (裁-83): factory reset · apply `0155` · the
   sixteen-step happy-path walk · as-run.

## Digest consequences (to fold as §14 on signature)

- **Law 84 — The paid-beta gate.** Three walls + checkout success; RM0 until the pricing sitting;
  "trial", never "RM0"; nothing invoices until `amounts_ruled`.
- **Law 85 — Honest notes are a lawful permanent state for a paused lane**, swept against the
  lane's `PROGRESS.md` row (ADR-0075 §6), never against a merge that will not come.
- **Law 28 kept** (裁-86): the Codex-build / opus-review split is the cross-model pass; a
  native-built money surface adds a Codex read-only leg. **The e2e leg**: a frontend train is
  DONE only after a real-browser walk of its journey on the built app. Law 83 (ADR-0076): the
  switch ceremony is one combined G1 ceremony of three switches, post-beta (裁-40 · 44 · 59 · 76).

*Dated note 2026-09-02: 裁-111 (owner, 2026-09-01) time-boxes law 28 — the cross-family Codex
review leg is suspended until beta live; the opus lane is the complete gate meanwhile.*

## What this entry does NOT change

PRD §6 (the invariants), hard constraints 1–15, the DB-owns-every-number law, the seven reserved
human acts, ADR-061's uniform ladder, ADR-0075's data authority (which still expires at beta).
