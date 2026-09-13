# Clara — Project Progress

## Current State

- `main` at `9a0697c1` (PR #765 merged by fast-forward): migrations end at **0187_legal_v1_beta_publication**. Working tree clean apart from the untracked release wizard `scripts/ops/release-0185-0186.sh` (owner decides: commit or delete).
- Hosted (2026-09-13): DB frontier **182 / 0187**; `clara-runtime` **v82** = image `refresh-98f6eec6` (`/ready` true, every lane ok); `clara-web` version **742b09e9** (tag `refresh-98f6eec6`) at 100%; signed-in `/api/build-info` reports `git_sha 98f6eec6…` paired with the Fly runtime. Rollback points: DB 0184 (append-only restore of the 0185/0186 recut bodies), runtime `refresh-103969f6` (v81), web `b98422fb`.
- Legal texts: Terms v1 and DPA v1 are the **beta templates** (each says on its face that it is pending the owner's lawyer's review), published by 0187 at the owner's 2026-09-13 decision; reviewed wording publishes as v2 through `clara.publish_legal_document`.
- Stripe: the test-mode endpoint subscribes to all four checkout events; `CLARA_STRIPE_LIVEMODE=test`; admission capacity unlimited (`max_firms` NULL).

## Completed

- 2026-09-13 triage of the 37 refresh follow-up reports (ledger on #683): 6 closed, 31 `ready-for-agent` (the 7 owner decisions became briefs: #691 Node 22 base, #736 rail closes on a narrow crossing, #741 Asia/Kuala_Lumpur, #720 Half 1 with successor #764, #744 accept + guard, #755/#690 strip the dead citations), 1 `needs-info` (#732).
- Hosted release of 0185 + 0186 (#621, #628) and of 0187; both issues closed with hosted evidence and the owner's signed-in walks in the in-app Browser pane: signup → code → resend counted as an attempt → Terms/DPA v1 accepted → refresh keeps them → checkout → cancel → start again → 0.00 sandbox subscription settled as `no_payment_required` → claim opened the firm "Walk Test 0913".
- Local rig on this machine recorded in memory: WSL Node via `/opt/node` + corepack pnpm, root-owned `~/clara-deploy` clone, PostgreSQL 17 rig cluster recreated per chain; the web bundle must be uploaded from WSL.

## In Progress

- None. No `awaiting-release` issue remains.

## Known Issues

- #732 (hosted React #418 on the Work detail route) still needs the owner's reproduction on the new web build (742b09e9); it may have been an edge-cache / bundle skew.
- Production now holds a walk artefact: a user (the owner's Gmail alias) and the firm "Walk Test 0913" (`c5616f91`) with one 0.00 sandbox subscription. Keep it as a test firm or remove it through operator support (#615); the owner decides.
- The 24 h expired-session face and a delayed async (FPX-style) confirmation were not walkable in one sitting; those arms are proven by the db/runtime cells and the subscribed events.

## Next Steps

1. Next session: `/implement` on the wayfinder tickets the owner picks (#612 children, frontier per #597). Ready-for-agent riders by lane: web #698 #715 #733 #734 #736 #741 #743 #746 #719 #760 #706 #740 #722 #755; db #692 #718 #720 #742 #744 #750 #709 #690; runtime tests #754 #756 #708 #745 #693 #707 #714; infra #691.
2. Owner: reproduce #732 on the new web build (or close it as resolved by the redeploy); decide the fate of the walk firm and of `scripts/ops/release-0185-0186.sh`.
3. When the lawyer-reviewed Terms/DPA wording arrives: publish it as v2 through `clara.publish_legal_document` (operator-firm owner) or a seed migration; the beta v1 rows become superseded.
