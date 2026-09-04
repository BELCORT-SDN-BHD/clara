# ADR-0078 · The beta simplification: a firm-level consent declaration, every attestation ceremony and maker-checker wall abolished, basic RBAC as the only human gate, automatic receipts

**Date:** 2026-09-04 · **Status:** standing — **ruled by the owner 2026-09-04 ≈09:15–09:22 MYT (裁-186 · 裁-187)**
(this entry minutes two rulings the owner gave in the dated ledger; per 裁-140 a new ADR is minted only
when a ruling contradicts an ADR's text outright AND permanently — both of these do).
**Source ledger:** `docs/plan/active/mohe-grill-rulings-2026-09-04-pm.md` (裁-186 · 187, with 188 · 189 ·
190 as the session's operating rulings), which governs on any divergence with this minute.

## Decisions minuted

1. **Client AI consent is a FIRM-level declaration, made once at the DPA stage, and every client of the
   firm is consented automatically** (裁-186, AGAINST the recommendation). The DPA page carries one
   declaration — the firm holds, or will hold before processing, each client's written authorization for
   AI processing — signed with the DPA as its own versioned, hashed receipt. The database admits that
   declaration as an evidence kind for `clara.grant_client_egress`; the onboarding commit's successor
   door auto-mints the client's consent and activates every purpose citing it. Per-purpose activation
   and the consent receipt shape are untouched; a per-client letter uploaded later is an evidence
   UPGRADE on the same consent, never a second consent. The compliance register shows each client's
   consent state and evidence kind.
2. **Every attestation CEREMONY and every maker-checker wall is abolished; basic RBAC is the only human
   gate** (裁-187). No typed declaration, no tick, no second confirm, no distinct-approver rule, no
   high-stakes threshold, no reopener≠closer wall, no adoption attestation, no solo-firm exception —
   "user 按什么就是什么". The gate is the caller's rank: **viewer** reads · **bookkeeper** uploads,
   drafts, matches, answers Clara, and approves and posts ANY amount, own drafts included · **admin+**
   additionally begins, finalizes and abandons a close, approves the opening seed and holds firm settings
   · **owner** alone holds members, legal signatures and the operator-tier acts. The roster is the
   existing four ranks (`0002_foundation.sql:215`, `role_rank`); floors move, nothing new is minted.
3. **Automatic receipts stay, at zero ceremony** (裁-187's receipt sub-ruling, after a plain-language
   re-brief). Every governed click writes one row the door itself mints — actor, time, and the gate
   states it covered (a close finalize names each gate's verdict, UNKNOWN included) — visible only on the
   Activity timeline. This is the one evidence a firm can put in front of MIA, an auditor or LHDN later.

## What each decision supersedes (the "amended by" lines these rulings owe)

- **ADR-0003 · digest law 4** ("maker/checker is modelled always, hard distinct-approver gate on the
  high-stakes lane, solo firms record an attestation") — **ABOLISHED** by decision 2. Maker and checker
  identities stay RECORDED on every entry (the receipt); the distinct-checker gate, the threshold and the
  solo-firm attestation are gone.
- **ADR-0065 · law 25 / E-R2** (three keys, the drawer-2 per-item attestation, the firm-configurable
  authorization list) — keys ②③ become one-click admin+ acts; the drawer-2 gates stay EVALUATED and
  RECORDED but no longer refuse for want of an attestation. **The B3 segregation wall** (ADR-0068's
  reopener≠closer) is gone.
- **ADR-0070 · law 69** (adoption through a recorded attestation) — an orphaned proposal is approved by
  rank like any other; the receipt records it as an adoption.
- **ADR-0071 · law 71** (the surviving human acts, "the agent can never satisfy a human sign-off") and
  **ADR-0074 · law 78's rider R-TA-P1-walls** — the reservation shrinks to the RBAC-floored acts:
  statutory wording, `canonical` definitions, capability grants, e-filing and the legal signatures; the
  B6/B14 walls that read a live attestation row have no subject once the ceremony is gone.
- **ADR-0011 / ADR-0018 · digest laws 57 and 58** ("firm-facing client authorization — MIA By-Laws require
  *specific* authority", "consent is typed and purpose-scoped … a grant alone does not authorize") — the
  purpose scoping SURVIVES; the per-client evidence rung is relaxed to the firm-level declaration by
  decision 1.
- **PRD §1's** "professional human control concentrates at the statutory boundary" parenthetical, **§2
  "Segregation of duties"** and **§6 item 9**; **ARCHITECTURE** §0's drawer-2 exception sentence and
  **§3.4 Maker/checker** — each carries a strikethrough-and-supersession note pointing here, in the
  same PR that lands this file.

## Mechanism (which lane builds what)

- **The wall-removal database lane** (裁-188, this session, after the P0 block): one migration set on a
  throwaway rig that re-cuts the live bodies — `_approve_entry_core` and the drafting/allocation/
  settlement/bank-line cores (`p_attestation` optional-and-ignored where the signature can stay),
  `finalize_close` / `reopen_fiscal_year` / `attest_close_exception` (the attestation rung replaced by the
  automatic receipt), the adoption path, the opening-seed and onboarding-commit doors, and
  `set_firm_high_stakes_threshold`'s retirement — and re-cuts every cell that pinned a wall to pin the
  receipt instead. `sst_future_attestations` / `record_future_attestation` are OUT of scope (a captured
  SST fact, not a ceremony) unless the owner pulls them in.
- **The consent lane** (decision 1): the DPA-stage declaration (a receipt row and its byte-identity
  under 裁-90), the evidence-kind widening on the grant door, the auto-grant at onboarding commit, and the
  compliance register's per-client state.
- **The UIUX lanes** remove every attestation ceremony from the web as they reach each surface — the
  41 `attest`-keyed strings in `apps/web/messages/en.json`, the close, opening, onboarding-commit, journal
  approval, bank settle and adoption dialogs — and the Admin "Change threshold" control.

## Dissents on file (each stated once, never relitigated)

- **On decision 1:** MIA By-Law R114.3(b)'s obligation is per client and written; a firm-level
  declaration is the firm's representation, not the client's authorization, so the exposure moves to
  the firm and Clara processes on a representation it cannot verify. The declaration's wording joins the
  lawyer pass (裁-166); the lead recommends the per-client evidence rung be revisited before 上市.
- **On decision 2's RBAC matrix:** segregation of duties is the control every auditor expects; under
  the ruled matrix a bookkeeper can post any amount alone, and the receipt makes that visible afterwards,
  never preventable. Accepted by the owner as the beta's operating risk.

## Consequences stated once

- A firm that ticks the declaration without holding its clients' letters is exposed under MIA By-Law
  R114.3(b); the product no longer refuses on that account.
- The close's gate list is a READING, not a gate: an UNKNOWN gate no longer blocks finalize; the receipt
  records that it was UNKNOWN when the owner clicked.
- The high-stakes threshold and its Admin control disappear from the product, which also closes the
  audit's CB-AE2E-014 (owner-only threshold control visible to a bookkeeper) by removal.
