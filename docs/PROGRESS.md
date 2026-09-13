# Clara — Project Progress

## Current State

- `main` at `39f795cf`: migrations end at **0187_legal_v1_beta_publication**. Working tree clean (the one-off release wizard was deleted at the owner's decision).
- Hosted (2026-09-13): DB frontier **182 / 0187**; `clara-runtime` **v82** = image `refresh-98f6eec6` (`/ready` true, every lane ok); `clara-web` version **742b09e9** (tag `refresh-98f6eec6`) at 100%; signed-in `/api/build-info` reports `git_sha 98f6eec6…` paired with the Fly runtime. Rollback points: DB 0184 (append-only restore of the 0185/0186 recut bodies), runtime `refresh-103969f6` (v81), web `b98422fb`.
- Legal texts: Terms v1 and DPA v1 are the **beta templates** (each says on its face that it is pending the owner's lawyer's review), published by 0187 at the owner's 2026-09-13 decision; reviewed wording publishes as v2 through `clara.publish_legal_document` (the BELCORT firm carries `is_operator`; its owner is the operator).
- Stripe: the test-mode endpoint subscribes to all four checkout events; `CLARA_STRIPE_LIVEMODE=test`; admission capacity unlimited (`max_firms` NULL).
- Test firm kept in production at the owner's decision: "Walk Test 0913" (`c5616f91`, one 0.00 sandbox subscription, owner = the owner's Gmail alias).

## Completed

- 2026-09-13 triage of the 37 refresh follow-up reports (ledger on #683): 6 closed, 32 `ready-for-agent` (the 7 owner decisions became briefs: #691 Node 22 base, #736 rail closes on a narrow crossing, #741 Asia/Kuala_Lumpur, #720 Half 1 with successor #764, #744 accept + guard, #755/#690 strip the dead citations; #732 reproduced and briefed), 0 `needs-info`.
- Hosted release of 0185 + 0186 (#621, #628) and of 0187; both issues closed with hosted evidence and the owner's signed-in walks in the in-app Browser pane: signup → code → resend counted as an attempt → Terms/DPA v1 accepted → refresh keeps them → checkout → cancel → start again → 0.00 sandbox subscription settled as `no_payment_required` → claim opened the firm "Walk Test 0913".
- #732 reproduced on the new build: React #418 fires on every first load below the `lg` breakpoint (375 px, 800 px) and never at 1280 px; the server renders the desktop shell while the client's first render produces the narrow shell. Brief posted; the component is named by a dev-build hydration diff.
- Local rig on this machine recorded in memory: WSL Node via `/opt/node` + corepack pnpm, root-owned `~/clara-deploy` clone, PostgreSQL 17 rig cluster recreated per chain; the web bundle must be uploaded from WSL.

## In Progress

- 2026-09-13/14 implementation wave on the 11 refresh tickets #615 #619 #620 #622 #624 #631 #637 #640 #641 #643 #644 (all assigned to the owner). Session ended on the weekly usage limit mid-wave; the full handoff — per-branch HEADs, open review findings, decisions, rig ports, owner confirmations, ordered next steps — is [docs/plan/active/refresh-wave-2026-09-14/HANDOFF.md](plan/active/refresh-wave-2026-09-14/HANDOFF.md) with the per-ticket briefs, WORK-ORDER.md, RIG.md and rig scripts beside it. State at handoff: `integration/wave-1` (worktree `clara-wtintegration`, d6a64207) = main + #622 + #620 + #619, typecheck/lint green; #615/#641/#643 finished but unmerged; #640/#644/#624/#637 in review-fix rounds with blockers listed; #631 just started on #643's tip; shared `chatTurn_v19` not started. Nothing pushed; main unchanged at 8f0de590.

## Known Issues

- #732: every narrow-viewport first load logs React #418 and re-renders the tree on the client (functionally recovers; performance and console noise). `ready-for-agent`, web lane.
- The 24 h expired-session face and a delayed async (FPX-style) confirmation were not walkable in one sitting; those arms are proven by the db/runtime cells and the subscribed events.

## Next Steps

0. Resume the refresh wave from the HANDOFF.md above (read it first; inspect every worktree before trusting a fix landed; restart the WSL clusters if WSL restarted).
1. After the wave: `/implement` on the remaining wayfinder tickets the owner picks (#612 children, frontier per #597). Ready-for-agent riders by lane: web #732 #698 #715 #733 #734 #736 #741 #743 #746 #719 #760 #706 #740 #722 #755; db #692 #718 #720 #742 #744 #750 #709 #690; runtime tests #754 #756 #708 #745 #693 #707 #714; infra #691.
2. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (as the BELCORT owner) or a seed migration; the beta v1 rows become superseded.
3. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
