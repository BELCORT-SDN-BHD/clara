# ADR-0077 · The beta pivot: a paid launch at RM0, tax inert at launch, the cutover re-scoped, the G1 clocks deferred, and the review leg under Codex

**Date:** 2026-08-31 · **Status:** standing — **PENDING THE OWNER'S SIGNATURE on the digest**
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
7. **Development leadership passes to Codex** (裁-82); Stripe is entirely Codex's, TEST mode first,
   keys only in the Codex MCP env and server secrets (裁-81).
8. **The independent review leg under Codex** (裁-84): a fresh, separate `codex exec` read-only
   review + the owner's read. **Digest law 28's "cross-model" clause is amended in substance to
   "cross-session"**; ADR-061's uniformity is unchanged. *Orchestrator's dissent on file in the
   08-31 ledger: the two model families caught disjoint defect classes this fortnight; a Claude leg
   on the four money/auth surfaces of the sprint was recommended and declined.*
9. **A reduced Wave G stays in front of beta** (裁-83): factory reset · apply `0155` · the
   sixteen-step happy-path walk · as-run.

## Digest consequences (to fold as §14 on signature)

- **Law 84 — The paid-beta gate.** Three walls + checkout success; RM0 until the pricing sitting;
  "trial", never "RM0"; nothing invoices until `amounts_ruled`.
- **Law 85 — Honest notes are a lawful permanent state for a paused lane**, swept against the
  lane's `PROGRESS.md` row (ADR-0075 §6), never against a merge that will not come.
- **Law 28 amended**: cross-session under a single model family satisfies the money-touching
  review requirement (裁-84). Law 83 (ADR-0076): the switch ceremony is one combined G1 ceremony
  of three switches, post-beta (裁-40 · 44 · 59 · 76).

## What this entry does NOT change

PRD §6 (the invariants), hard constraints 1–15, the DB-owns-every-number law, the seven reserved
human acts, ADR-061's uniform ladder, ADR-0075's data authority (which still expires at beta).
