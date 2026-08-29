# 磨合 grill rulings — 2026-08-29 (the second ledger; continues `mohe-grill-rulings-2026-08-28.md`, which closed at its 500-line cap after 裁-28)

*Same shape as the first ledger: one question per turn, 大白话 each, the owner's words where he
gave them, the ruling, the consequences. The first ledger carries 裁-1 … 裁-28.*

## 裁-29 · The backend residuals are PULLED INTO the sprint — "🔴+⚠️ 全拉进冲刺"

**What the owner asked.** Whether PROGRESS Next-4's "remaining" line (*F-A8 · F-A9 PR-1A · F-A5b
PR-3 · F-A6 v2 · Track B · G1 flips · the F-A4/F-A6 runtime halves · the R2 PRD wording*) was
stale, drifted or wrong — and whether any of it affects the product's experience or features.

**The census (verified against branches, migrations, runtime code and the design docs — not
from PROGRESS).**

| Item | Measured state | Product impact |
|---|---|---|
| R2 PRD wording | SHAPE ruled 2026-08-26 (card R2); the two sentences drafted 2026-08-27 with BOTH owner checkboxes unticked; `PRD.md` untouched. PROGRESS's "owner-approved" was an overstatement. | none — the mechanism (0132/0135) is live; docs only → **裁-30 below** |
| F-A9 PR-1A | **STALE** — `0110` merged (#317) and live. Remaining: PR-1B (brake census DB half: remove the unattended 60%/100% token-budget block, `refused_budget`→`refused_concurrency`, one D1 window) · PR-1C (dashboard rename) · PR-3 (acceptance on real usage). PR-2 is done (`chatTurn.v14.usage.ts`). | ⚠️ unattended drafting still hits the old cap (laws 76/81: meter, never cap) |
| G1 wake sources | live read 2026-08-29: `bank_agent` and `close_prep` both `enabled=false`; F-A3/F-A4 owe the wake workflow bodies + the INSERT-and-flip | 🔴 Clara does not run bank matching / close prep on the clock — only the human-triggered half of the agentic thesis is live |
| F-A6 PR-2 runtime | `packages/runtime` has ZERO callers of `wake_freeform_read`; the DB verb (`0131`/`0136`) is live, the runtime never wired it | 🔴 Clara cannot free-read the books in chat (typed reads only) |
| F-A4 PR-2b runtime | `prepayment_schedule_v1` `deployed=false`; the limb live-inert | ⚠️ no prepayment-schedule proposals (MPERS 17.19) |
| F-A5b PR-3 render worker | unbuilt (sequenced after card-1 by ruling); the frontend's "byte-download door" gap recorded at P3. Also: the FORMAL seal chain has never carried a run (`report_run` zero rows; DR re-render drill unrun) | 🔴 report download dead; the formal chain unexercised |
| F-T3 draft tax computation | design v1.2 gated, ALL-IN ruled; both hard gates (F-A5 PR-1 `0111`, F-A4 `close_receipts` `0120`) now live; no branch | 🔴 the "tax" stage of the lifecycle is manual without it |
| F-T1 SST engine | branch f-t1/pr-1 built + reviewed 2026-08-24, main ~124 commits ahead; owner's B-variant "pre-beta if it fits" | ⚠️ SST-registered clients only |
| F-T2 payroll calendar | `statutory_deadlines` live-EMPTY (`0139`); rows + chase unbuilt; 8 owner questions open | ⚠️ the deadline reminders are empty |
| F-T4 fix queue | PR-1 merged; remainder beta-era by ruling | 🟢 low |
| F-A8 internet lane | partial branch f-a8/pr-1 (2026-08-23, an UNNUMBERED Tier-1 substrate), depends on F-T1's SST table | 🟢 low unless FX clients (FX timing is the owner's open item) |
| F-A6 v2 cross-client | design gated; v1 refuses `cross_client_unavailable` naming the deferred action | ⚠️ HOME chat cannot answer firm-level cross-client questions |
| (found) chat parts | 10 part types render id-only summaries (`PartRenderer.tsx:28`) | ⚠️ thin chat cards; P6's `chatTurn_v15`+ covers part |

**RULING (owner, ~09:20): "🔴+⚠️ 全拉进冲刺（推荐）".** ALL EIGHT are pulled into the sprint,
before Wave G: G1 clock flips (the F-A3/F-A4 wake bodies + INSERT-and-flip) · F-A6 PR-2 runtime
(freeform read in chat, H-4/H-5/S-1) · the reports chain walked end to end + F-A5b PR-3 · F-T3
(PR-0 gate → build) · F-A9 PR-1B · F-A4 PR-2b · F-T1 (rebase → merge → window) · F-T2 rows (its
eight owner questions go to the next batch). **Beta-era: F-A8 · F-A6 v2 · F-T4's remainder.**
Cost stated to the owner: ~8 lanes, 3–4 D1 windows, one runtime deploy; the sprint lengthens.

**Consequences.** Lanes dispatched the same hour: F-A9 PR-1B · F-T1 rebase + re-verify · F-T3
PR-0 replay gate · F-A6 PR-2 (`chatTurn_v15`). The G1 wake bodies + F-A4 PR-2b, F-A5b PR-3 and
F-T2's questions follow as the first builds report. PROGRESS Next-4 trued (this ruling);
the lane rows' "not owed to 磨合" phrasing is superseded by this ruling wherever it appears.

## 裁-30 · The R2 PRD two-tier wording — APPROVED VERBATIM ("批准，照原文进 PRD")

The two proposed texts in `r2-prd-two-tier-wording-draft-2026-08-27.md` were put to the owner
word by word (English original + a 大白话 gloss) and approved unedited. Landed in the same docs
PR: PRD §4 capability item 15 replaced; PRD §6 invariant 1's sentence appended. The draft's two
checkboxes are ticked and it stays as the provenance record. No mechanism changes — digest law
74's two tiers, the `sandbox_watermark` trio (`0132`) and the card-1 seam (`0135`) were already
live.
