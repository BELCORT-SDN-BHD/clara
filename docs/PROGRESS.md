# Clara — Project Progress

## Current State

- `main` at `fb30848e` (2026-09-14, wave 1 of the refresh implementation, PR #769): migrations end at **0190_document_byte_door_v2** (0188 operator support, 0189 work list reads, 0190 document byte door v2). Local docs commits for the wave sit ahead of origin/main and ride into the wave-2 PR.
- Hosted (unchanged since 2026-09-13): DB frontier **182 / 0187**; `clara-runtime` **v82** = image `refresh-98f6eec6`; `clara-web` **742b09e9**. 0188–0190 are NOT released: the release ceremony (`awaiting-release-ceremony` memory + #637's rollback preflight, once wave 2 lands) is a separate step needing writer quiescence.
- Legal texts: Terms v1 and DPA v1 are the beta templates (0187); reviewed wording publishes as v2 through `clara.publish_legal_document`.
- Stripe: test-mode endpoint subscribed to all four checkout events; `CLARA_STRIPE_LIVEMODE=test`; admission capacity unlimited.
- Test firm kept in production at the owner's decision: "Walk Test 0913" (`c5616f91`).

## Completed

- 2026-09-14 wave 1 of the refresh implementation landed on `main` via PR #769 (fast-forward after `ci` green, the first real run of #620's `storage-policy-battery` job): #619 (parallel e2e harness), #622 (sign-in / recovery / safe return), #615 (0188 operator support), #641 (0189 B-style Work list + detail Tabs), #620 (0190 source custody). Closed with local evidence: #619 #622 #615 #641 #620 and the defects #722 #740 (#619) and #698 (#622). Reviews and fix-round reports: `docs/plan/active/refresh-wave-2026-09-14/reports/`. The merged tree caught one census (`checkout-gate-c3` c3.53, #615's reader admitted with its reason) and one runner flake (work-question e2e leg 5, green on re-run).

- 2026-09-13 triage of the 37 refresh follow-up reports (ledger on #683): 6 closed, 32 `ready-for-agent` (the 7 owner decisions became briefs: #691 Node 22 base, #736 rail closes on a narrow crossing, #741 Asia/Kuala_Lumpur, #720 Half 1 with successor #764, #744 accept + guard, #755/#690 strip the dead citations; #732 reproduced and briefed), 0 `needs-info`.
- Hosted release of 0185 + 0186 (#621, #628) and of 0187; both issues closed with hosted evidence and the owner's signed-in walks in the in-app Browser pane: signup → code → resend counted as an attempt → Terms/DPA v1 accepted → refresh keeps them → checkout → cancel → start again → 0.00 sandbox subscription settled as `no_payment_required` → claim opened the firm "Walk Test 0913".
- #732 reproduced on the new build: React #418 fires on every first load below the `lg` breakpoint (375 px, 800 px) and never at 1280 px; the server renders the desktop shell while the client's first render produces the narrow shell. Brief posted; the component is named by a dev-build hydration diff.
- Local rig on this machine recorded in memory: WSL Node via `/opt/node` + corepack pnpm, root-owned `~/clara-deploy` clone, PostgreSQL 17 rig cluster recreated per chain; the web bundle must be uploaded from WSL.

## In Progress

- 2026-09-14 wave 2 of the refresh implementation, assembling on `integration/wave-2` (worktree `clara-wtintegration2`, branched from the wave-1 tip): #624 (0191) merged with the Work-detail Sources-tab state panel (AC4) as an integration commit; #644 (0192, two fix rounds), #637 (no migration, two fix rounds) and #643 (0194, one fix round) final and queued for merge; #640 (0193) in its second fix round (the closure review found a naked-reversal path through a cancelled accrual). Wave 3 = #631 (0195, `claraWork_v3`, in progress on #643's final tip) + the shared `chatTurn_v19` (not started; needs wave 2's tree). Live state, per-branch tips, open owner confirmations and the ordered next steps: [docs/plan/active/refresh-wave-2026-09-14/HANDOFF.md](plan/active/refresh-wave-2026-09-14/HANDOFF.md).

## Known Issues

- #732: every narrow-viewport first load logs React #418 and re-renders the tree on the client (functionally recovers; performance and console noise). `ready-for-agent`, web lane.
- The 24 h expired-session face and a delayed async (FPX-style) confirmation were not walkable in one sitting; those arms are proven by the db/runtime cells and the subscribed events.

## Next Steps

0. Resume the refresh wave from the HANDOFF.md above (read it first; inspect every worktree before trusting a fix landed; restart the WSL clusters if WSL restarted).
1. After the wave: `/implement` on the remaining wayfinder tickets the owner picks (#612 children, frontier per #597). Ready-for-agent riders by lane: web #732 #698 #715 #733 #734 #736 #741 #743 #746 #719 #760 #706 #740 #722 #755; db #692 #718 #720 #742 #744 #750 #709 #690; runtime tests #754 #756 #708 #745 #693 #707 #714; infra #691.
2. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (as the BELCORT owner) or a seed migration; the beta v1 rows become superseded.
3. When the admission beta should stop taking firms: `set_admission_capacity` (BELCORT owner).
