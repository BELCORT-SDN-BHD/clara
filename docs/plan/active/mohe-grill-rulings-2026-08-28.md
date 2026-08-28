# 磨合 grill rulings — the 2026-08-27/28 night batch

*The third ruling ledger of the 磨合 window, sibling of
`mohe-grill-rulings-2026-08-27.md` (the opening grill, Q1-Q9 + Q-A…Q-F) and
`mohe-grill-rulings-2026-08-27-evening.md` (R1-R7). Same convention: each entry is the
owner's actual words (kept verbatim where short), what was proposed, and what now binds.
Everything here was ruled in-session on 2026-08-27 evening through 2026-08-28; this file is
the record of record for the batch. Rulings that already landed in a subject document are
cross-referenced, not restated.*

## 裁-1 · Focus-ring alpha + Button treatment — 70%, 按推荐办

**Proposed:** the unified shadcn focus ring (R3 of the evening batch) at **70% alpha** —
the measured floor is 66% (at 65% the accent fails the 3:1 non-text contrast gate at
2.970:1), 70% gives headroom — plus the recommended Button treatment tier.
**Ruled:** "yes,按推荐办". 70% is the bound value; the contrast gate stays the enforcing
instrument (it is unconditionally strict since #367).

## 裁-2 · The entry-face trio (4a/4b/4c) — approved as demoed

Demonstrated live with real `apps/web/app/globals.css` token values (the 进门面三题
artifact), then ruled "yeah可以，没问题，听你的":

- **4a — white card on the identity-canvas** for the entry faces (login/signup/invite):
  the card edge defined by shadow, decorative border only — no new meaning-bearing border
  that would face the contrast gate.
- **4b — the waiting-for-approval page is the FOURTH entry face** and shares the
  identity-canvas ground (R2's original text named only three faces; this extends it by
  explicit ruling, not by drift).
- **4c — the `--input` token recut is APPROVED to initiate**: current `#C7C5BD` never
  reaches 3:1 on any product ground (1.73:1 on white, 1.60:1 on the canvas — a P2-era
  stock issue, not an identity-canvas artifact). The recut lands in the **clarabook**
  repo (design-system home) one step darker; the demo value `#8F8D85` (3.3:1 / 3.1:1) is
  illustrative, the final value is the recut PR's to set. `apps/web` re-ports the token
  after the recut merges.

## 裁-3 · The polish-tier trio — 明白，批准

**Proposed and approved** ("明白,批准."): the three-tier polish model for the built
frontend — (a) **conformance items** (token/contract violations) are fixed as found, never
deferred; (b) **flow-level polish** (motion, transitions, empty/loading states per journey)
batches into the **P6 WHOLE-frontend polish wave** with the four-card wire bump; (c)
**identity flourishes** (Ledger Fold port, ClaraBook copy pass, entry-face treatment) ride
the same P6 wave with the conformance-audit checklist as the closing gate. Nothing built
so far waits on polish to ship; nothing skips the conformance floor.

## 裁-4 · The MCP grounding pair (7a-7d)

- **7a** ("同意"): Mobbin grounding docs bind the port wave's four NEW flows + P4's four
  flows as build-order notes (`p4-mobbin-grounding-2026-08-28.md`,
  `mobbin-grounding-wave-2026-08-28.md`).
- **7b**: the owner connected the **Mobbin MCP and shadcn MCP live** ("我刚刚登陆了mobbin
  mcp…also schadcn mcp also连了"). Standing answer to "did the built frontend miss them":
  the build consumed the vendored shadcn registry + design skills throughout; the live
  MCPs add *reference grounding* (Mobbin) and *registry queries* (shadcn) from P4 onward —
  the two grounding docs are that adoption. No retroactive rebuild is owed; the P6 polish
  wave re-checks built surfaces against the same references.
- **7c**: owner present at the machine for the sitting (recorded for the ceremony log).
- **7d** ("可以, 这个不急对吧? 只是view罢了, 可以进backlog or debts"): the Mobbin
  **flow-video viewing pass** is backlog, not a gate — registered in PROGRESS Backlog.

## 裁-5 · P5 clarified — F-A7b's joint gate, ran EARLY, already CLOSED

The owner asked "P5 呢? 为什么没看到p5?". Clarification of record (not a new ruling): in
the ruled P0-P6 order, **P5 = the F-A7b joint UI+backend design gate**, which was pulled
FORWARD and ran in parallel with P1/P2 — it **closed 2026-08-27 BUILD-AUTHORIZED**
(`fa7b-gate-record.md`). Its build train appears in queues under the name **F-A7b**, which
is why no separate "P5" line exists. Phase accounting: P0-P3 ✓ · P5 (gate) ✓ · P4 build
next · F-A7b build (P5's train) after wave A · P6 last.

## 裁-6 · Port wave = ruling A (recorded at its own docs, cross-referenced here)

"A,不过为什么停牌了？" → ruling A adopted: the **115-name roster, T0 seam PR + 11 trains
across waves A-E**. The plan of record is `port-wave-plan-2026-08-28.md` + `-part2.md`
(merged #379) with the CONDUCTOR ADOPTIONS block; the roster authority is
`verb-coverage-census-2026-08-28.md` (#374). The "停牌" answer: apps/dashboard retires at
the P6 cutover PR, not before the trains re-home its doors.

## 裁-7 · The FULL-PRODUCT assurance frame (standing, re-confirmed twice)

The owner's standing question ("确定is FULL FRONTEND AND FULL PRODUCT RIGHT?") is answered
by the coverage equation + four anti-drift instruments, re-confirmed at this batch:
**250 backend items = 60 wired + 81 port-wave + 24 orphans→journeys + ~79
cited-deliberate + 4 exceptions + 2 stale-notes (fixed #375)**; instruments: (i) every
design doc pairs each backend ask with its frontend home; (ii) the merge-trues-the-note
law (a STALE-NOT-BUILT note is trued by the subject train's merge); (iii) census +
conformance re-runs as P6 exit gates; (iv) the Wave-G estate e2e. New mechanical rule
minted with this batch (lives in `.claude/rules/db-migrations.md`): **any migration adding
a `clara_authenticated` door must name its frontend home or non-UI ruling in the PR
body.**
