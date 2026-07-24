# Wave B LIVE GATE RUN — Rome Secretary (Gates O + K) · 2026-07-24

> Executed against PRODUCTION on the owner's real documents (`RS - YA2025` pack), driven
> through the real dashboard surfaces via Playwright, with owner authorization at each
> irreversible step. Pinned deploy state: **Supabase 18 migrations · `clara-runtime:wave-b-v25`
> · dashboard rider live** (ADR-038). No fabricated documents; every answer taken from RS's
> own records.

## The client

**ROME SECRETARY SDN BHD** (202501019265 / 1620678-M) — incorporated 5 May 2025, first
financial period 05/05/2025–31/03/2026 (FYE 31 March), revenue RM27,315, net loss exactly
RM1,000. At 31/03/2026 every asset and liability nets to zero; only share capital RM1,000
(Cr) and accumulated losses RM1,000 (Dr) remain. Maybank 514487003061 closed 19/03/2026;
a strike-off fee was posted 06/03/2026 — the company appears to be winding up.
Onboarded as an **ongoing client with a prior-period closing position** (takeover as at
1 April 2026), which is both the correct treatment and the shape Gate K requires.

Identifiers: client `e054b797` · plan `210b5e44` · interview run
`wrun_01KY9HTNDZBAYN474V0342MJDJ` · seed `8da11d09` · tie document `11d24553`.

## GATE O — CLOSED

- Durable interview ran end-to-end through the product: **17 segments**, echo-back
  confirmation on every must-ask, real answers throughout (TIN skipped under the
  turnover-gated exemption — the live regression check of the v25 segment-order fix;
  MSIC skipped rather than guess a regulatory code).
- **Kill-mid-interview proof PASSED in production.** At plan revision 9 the Fly machine
  was stopped (runtime `/ready` unreachable, run left non-terminal `running`), then
  restarted. The interview **re-parked on the identical question** with all eight answers
  byte-identical, no duplicate items, no revision drift, and the full 15-message
  transcript replayed. This is the rig e2e's exact assertion, proven live.
- Interview run settled **`completed`**; plan reached revision 15 with 14 items; the
  client remained **`onboarding`** — invisible to operational consumers — until commit.
- **Commit succeeded** via the solo path: `commit_client_onboarding` →
  `attestation_kind: self_approval_attestation`, client **`active`**, plan
  **`committed`** (rev 16), `review_maker` recorded.
  *(BELCORT has `eligible_checker_count = 1`, so WB-R22's temp-admin ceremony does not
  apply — the designed-in solo attestation path is the lawful route for this firm shape.)*
- Event trail: `client.onboarding_started` → `client.resolved` → `document.filed` →
  `account.upserted` → `entry.drafted` → `entry.approved` → `opening_seed.batch_approved`
  → `onboarding.plan_committed` → `client.activated`.

## GATE K — CLOSED (attributed keyed path, WB-R15)

- **Document-primary is NOT feasible on live OCR** (see finding 2) → the ruled keyed
  fallback applied, which is exactly what 0018's subject-bound resolutions were built for.
- **0018's bound mint verified in production**: the attribution act minted a resolution
  with `bound_scope_kind='opening_seed'`, `bound_scope_id=8da11d09`, `subject_id`=the seed,
  `method='human'`, `confidence=1.000`. The cross-seed replay gap is closed on real data.
- Targets recorded from the real Statement of Financial Position: `share_capital` 100-000
  **credit RM1,000.00**, `retained_earnings` 150-000 **debit RM1,000.00**, both provenance
  `KEYED by 27ba34b6`.
- Items drafted: `gl_balance/share_capital` (leg 100-000 Cr 1,000) and
  `equity_net/retained_earnings` (signed amount −100000 ⇒ RE debit + OBE credit, both
  DB-resolved).
- **Dry-run TIES**: 100-000 delta RM 0.00, 150-000 delta RM 0.00, **OBE net RM 0.00 (nil)**.
- **Approved in one serializable transaction** — `status: finalized`, `batch_n: 1`,
  `entry_count: 2` (the 0018 §5 DB-authored receipt field, live), both entries
  `self_approval_attestation`.
- Posted trial balance, to the sen: `100-000 Cr RM1,000.00` · `150-000 Dr RM1,000.00` ·
  `190-000 Dr RM1,000.00 / Cr RM1,000.00` (nil) — exactly RS's real balance sheet.
- **Re-run writes ZERO**: same `op_key` replayed byte-identically — batch still 1,
  identical `finalized_at` to the microsecond, 2 entries, 4 lines, exactly 1 op_receipt.
- **Double-seed RAISES**: `CLR31 {"reason":"duplicate_seed"}` — "this client already has a
  semantic opening seed", zero writes.
- Not exercised this run: supersede-at-the-opening-date (deferred; the machinery is
  rig-proven).

## B-12 (RPR) — bootstrap PROVEN, seeding DEFERRED to an owner ruling

`bootstrap_client_plan` on the already-active **ROME PROPERTIES SDN BHD** created plan
`32cb595d` (state open, rev 1) carrying a single `carry_down_deferred` todo, with the
client's `active` status untouched — the incremental lane works as designed.

**The seeding half is deliberately NOT done.** RPR already holds **30 posted journal
entries** from the Wave A/A2 work. Carrying its YA2025 trial balance down now would risk
double-counting against live books. The as-of date and how a carry-down reconciles with
RPR's existing posted activity is an accounting judgment for the owner, not a mechanical
step.

## FINDINGS (product gaps surfaced by the live run)

1. **No chart-of-accounts lane exists — blocks every new client.** The interview records
   the LHDN/MPERS CoA seed as a *decision*; design note O9
   (`interview.v1.questions.ts:14`) assigns the actual writes to "the HUMAN dashboard
   lane" — **that lane is not built** (no dashboard page references `upsert_account`).
   A freshly onboarded client therefore has an empty chart of accounts and cannot receive
   opening balances or any posting. Unblocked here by calling the governed
   `upsert_account` verb directly for three equity accounts (100-000 SHARE CAPITAL,
   150-000 RETAINED EARNING `special=retained_earnings`, 190-000 OPENING BALANCE EQUITY
   `special=opening_balance_equity`). **Highest-priority fix.**
2. **Live OCR emits no `opening_tb.line` regions.** `azure-di:prebuilt-layout:2024-11-30`
   extracted the page and its tables (envelope present, `extraction_status=done`) but
   produced **zero `document_regions`** — so Gate K's document-primary parse is not
   feasible today. Confirms the WB-R15/R16 contingency.
3. **Filed documents arrive unclassified and there is no way to classify them.**
   `document_kind` was NULL after filing; the tie-document picker requires
   `document_kind in (opening_balance_doc, management_account)` with verified bytes
   (`openingApi.ts:116`), and no dashboard surface sets a document kind. The
   document-*tied* path is therefore unreachable from the product even when the parse
   isn't needed.
4. **The opening workbench surfaces a bare `CLR10` with no reason.** The real refusal was
   "GL carry-down cannot carry control, OBE, or RE accounts" (0017:3256) — only
   discoverable by reading the migration. 0018 §4 typed the *commit* refusals; the
   opening lane needs the same treatment.
5. **The interview asks for document attachment it cannot accept.** Segment
   `sample_invoices` says "Attach them now" but the interview surface has **no file
   input** — documents must be filed through the separate documents page.
6. **A session-token expiry mid-ceremony surfaces as a bare 401 and silently defeats the
   solo-attestation reveal.** `OpeningCeremony.tsx:152` only reveals the attestation input
   after parsing a `CLR05 self_attestation` refusal; an expired JWT returns 401 instead,
   so the approval simply fails with no path forward in the UI. (Completed here by calling
   `approve_opening_seed` directly with the attestation.) Argues for the WB-R27 BFF work
   and for surfacing auth expiry distinctly.

## Ruling applied

**≥48h park soak → DEFERRED to Phase 5** (owner ruling this session). The park is a
calendar soak, not a mechanism: durable park + exactly-once resume across process death is
proven both in the rig e2e and now live; there is no ambient expiry timer (WB-R20); and
long-run engine-hook survival is already under the armed canary `daba7f2e` (due
2026-08-02). Gate O's substance was proven without it.

## Remaining for Wave B

Gates **W2** (live authority-boundary audit — static half already clean; the two known
`[R2-F2]` deviations are scheduled for removal in 0019), **L** (a real conflicting pair
surfacing as a scheduled lint finding), **R2** (tick ceremony minting real signatures),
**F** (firm onboarding as a durable run — needs a genuinely new firm), the **S/P**
follow-on eval, and the B-12 seeding half above.
