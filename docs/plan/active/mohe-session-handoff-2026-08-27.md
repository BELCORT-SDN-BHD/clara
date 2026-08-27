# 磨合 session handoff — 2026-08-27 (compaction point)

*Written at a compaction boundary. `PROGRESS.md` remains the state authority; this file
carries the in-flight detail a resuming session needs that PROGRESS deliberately does not.*

## Merged to `main` this session

| PR | What |
|---|---|
| #362 | **P2 shell** — Supabase SSR invite-only auth · Clara rail + full-screen threads · the 18-part renderer + tsc guard · ⌘K. Post-merge full CI sweep ran ALL-GREEN. |
| #363 | **P3.0** — the human-lane foundation: `lib/read.ts` (`getRows`) + `lib/doors.ts` (`callDoor`, DoorRefusal verbatim/never-retried) + `useHydratedPart` loader-stability hardening. |
| #364 | **P3 workbench** — five journey lanes folded (journals · firm/registers · close/reports · documents · bank), 521/521. |
| #365 | **0137 three human read surfaces** — `firm_open_questions_visible` · `client_identifier_promotions_visible` · `users_visible`. Estate suite 3047/0. |

## In flight at the compaction point

1. **`web/p3-finale`** (worktree `.claude/worktrees/p3-finale`) — `web/p3-polish` (tip
   `10ca982`) + `web/p3-a11y-gates` (tip `f8fc891`) merged, both zero-conflict. A seam lane
   is truing **5 test failures** (fold-seam class: the a11y gates were written against
   pre-polish markup): the Attest KNOWN-VIOLATION test must FLIP to pin the fix · four
   zero-violation scans (bank matching · bank recon · documents quintet · needs-you) ·
   the contrast gate's 26-pair census must be re-derived against the polished tree and
   then **flipped to `--strict`** (its one former near-miss was fixed by polish).
   Rule given: real violations get COMPONENT fixes, stale fixtures get TEST truings;
   never delete a rule or exclude a surface to reach green.
2. **`f-a4/pr-1c`** (tip `a035c58`, FROZEN) — the close agent limb. Estate suite
   3144 tests / 3060 pass / 0 fail. Under **double review**: a fresh-context opus lane
   (law-71 four-wall re-derivation + two active bypass attempts + the oracle
   byte-unchanged proof) and a **Codex `gpt-5.6-sol` read-only adversarial pass**
   (worktree `.claude/worktrees/codex-rev-pr1c`; output at the session task file).
   Its rig container `clara-rig-fa4pr1c` (127.0.0.1:55977) is deliberately LEFT UP.

## Rulings made this session (beyond the grill record)

- **Self-serve signup EXISTS** (owner correction, 2026-08-27): a new firm's principal signs
  up and creates the firm; the invite door is for *intra-firm* staff + RBAC. Build it in
  **P4** (signup → operator approval in beta → in-firm invites/roles). The README's
  "disable signup in Supabase" deploy obligation must be re-worded at P4 to
  "closed until the P4 signup + approval gate ships".
- **PR-1c F1** (the beyond-design `_depreciation_run_due_core` extraction) ACCEPTED as
  inside R-L11 — the design's byte-claim was stale (0042's recut), and without it every
  clocked close refuses forever. Six design doc lines are owed a re-cut; the migration
  header enumerates them for transcription.
- **PR-1c F3** — `settle_close_proposal` ordered and built (the carrier had no writer for
  `adopted`/`withdrawn`, so a proposal stayed `open` forever and blocked its run).
- **PR-1c wrapper 13** (`wake_establish_prepayment_schedule`) PARKED with a positive-absence
  cell: it needs two live audited writers recut (a D1 window absent from Annex F) plus an
  unruled authority question (may the clocked lane reach an ADMIN-floor signing act?).
- **`statutory_deadlines`** stays OUT of the PR-1c train — PROGRESS's F-A4 row labels it
  "PR-1c" but it belongs to the payroll-calendar spec; needs its own lane + a PROGRESS
  re-label.
- Polish: the ClaraBook token contract (blob `d189698d`, byte-identical at the port SHA and
  upstream main) governs; five port drifts conformed (reduced-motion keeps opacity, motion
  scale 120/160/200 + both curves, radius, page-title 22/30). `--identity-canvas` was NOT
  bridged — §3.3 requires a **founder-approved impact note** to use it as a product-page
  ground; the lane correctly refused the conductor's ruling and recorded the citation.

## Owner questions parked for the next sitting

1. `--identity-canvas` (#F7F6F2) as the auth-page ground — §3.3's own escape clause needs a
   founder-approved impact note.
2. The focus-indicator collision: contract §9's 2px #1D4ED8 outline vs the vendored shadcn
   3px translucent ring (both AA-visible; recorded in `globals.css`, un-unified either way).
3. PR-1c wrapper 13's authority question (above).

## Backend-gap ledger (P6 blockers unless cleared)

- ~~firm_open_questions / client_identifier_promotions / users display-name read surfaces~~
  **CLEARED at #365.**
- **PR-1c** — in double review (clears the `close_proposal` card's carrier).
- `clara.users`' 0002-era base grant exposes email to self + active firmmates
  (reviewer-judged LOW; narrowing needs a consumer census — `clara_agent_ro` and
  `clara_freeform_ro` also hold it). Track-A debt row.
- Frontend note: `users_visible` includes REMOVED members by design — a "current colleagues"
  picker must filter via `firm_memberships`.

## Named follow-ups from the P3 reviews (not owed by any open branch)

- `Content-Range` count honesty on unbounded `getRows` lists (the counterparty-picker
  truncation class).
- The dashboard's inert-render document viewer port (by-mime img/object/pdf.js).
- Rail exit presence management (enter-only motion today).
- The 375px firm shell: `aside w-56 shrink-0` never collapses → a 136px content column
  (not an overflow — pre-existing; the mobile corridor is Q6's scope).
- `createScopeGuard`'s signal plumbing is still unused (the keyed `ClientScopeProvider`
  remount satisfies the contract structurally).
- Four named PR-1c battery gaps: B13 arm 1's stranded-prior-year half · B3's drawer-1
  unknown/error refusal · B14's reopened-with-draft · C-5's with-authority catch-up.

## The next rungs after the two open trains

1. P3 finale PR (seams green → squash) · PR-1c PR (double review clean → squash, number
   claimed at merge).
2. **Live-data e2e walk** (Q9 DONE rung 5): the owner APPROVED creating a fixture-firm test
   account through the REAL invite door (credentials env-only, never written to disk;
   mint at walk time — invite links are short-lived).
3. P4 (firm tiers + the ruled signup flow) → F-A7b build train → P6 (the four-part wire
   bump + the cutover PR) → Wave G (factory reset + estate e2e + beta).
