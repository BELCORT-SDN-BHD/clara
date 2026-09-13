# Clara — Project Progress

## Current State

- `main` at `551eefae` (docs-only after `3dcdcbda`, PR #759). Working tree clean apart from the untracked release wizard below.
- Hosted (read 2026-09-13 06:37 UTC): `clara-runtime` `/health` 200 and `/ready` true with every lane ok; `app.clarabook.com` `/login` and `/signup` 200. Last recorded release (2026-09-12): DB frontier 179 / 0184, runtime v81 = image `refresh-103969f6`, web version `b98422fb`. **0185 (#621) and 0186 (#628) are merged but not released**; the frontier was not re-read this session (no hosted DSN on this machine).
- Stripe test-mode webhook endpoint (`clara-runtime.fly.dev/api/stripe/webhook`) already subscribes to all four checkout events 0186 needs (read via the API on 2026-09-13), so #628's "subscribe the events" step is done.

## Completed

- 2026-09-13 triage of the 37 refresh follow-up reports (ledger on #683, verified at `551eefae`): 6 closed (#689, #735, #739, #737, #738 duplicates; #705 fixed on main by `50656d64`), 23 `ready-for-agent` with briefs, 7 `ready-for-human`, 1 `needs-info` (#732). Riders for #631 recorded on that ticket.
- Release wizard for 0185 + 0186 authored: `scripts/ops/release-0185-0186.sh` (13 stages, practiced order from the 2026-09-11/12 releases; untracked, owner decides whether to commit).

## In Progress

- #621 and #628 remain `awaiting-release`. The hosted release needs the owner's credentials (`fly auth login`, `wrangler login`, the DSN read through a probe machine) and one owner input (v1 Terms / DPA text). The wizard performs the ceremony and closes both issues with evidence at its last stage.

## Known Issues

- Owner decisions pending: #691 (Node 20 pin), #736 (rail at 320 px), #741 (time zone), #755 + #690 (cited governing docs do not exist), #720 (chat-lane reconciler), #744 (two clocks on the sweep set).
- #732 (hosted React #418) needs the owner's browser reproduction; may resolve itself after the 0185/0186 web redeploy.
- This clone is shallow (37 commits since `944a1931`, 2026-09-12); history before that needs `git fetch --unshallow` or GitHub.

## Next Steps

1. Owner: run `bash scripts/ops/release-0185-0186.sh` from the repo root (Git Bash; WSL for the web build). Decide the legal-text path (signed-in door call vs a 0187 seed migration) at stage 11. The wizard posts the evidence and closes #621 / #628.
2. Owner: rule on the seven `ready-for-human` issues above; each then becomes `ready-for-agent` with the drafted brief.
3. Next session: `/implement` on the wayfinder tickets (#612 children, frontier per #597), taking riders from the `ready-for-agent` set by lane — web: #698 #715 #733 #734 #743 #746 #719 #760 #706 #740 #722; db: #692 #718 #742 #750 #709; runtime tests: #754 #756 #708 #745 #693 #707 #714.
4. After the release: record hosted evidence here and in `docs/ARCHITECTURE.md` §11 (admission row, "hosted 未发布").
