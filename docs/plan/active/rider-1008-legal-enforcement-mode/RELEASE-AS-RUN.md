# #1008 hosted release — as run (2026-09-19 19:32–19:37Z · 2026-09-20 03:32–03:37 MYT)

Owner's direction, in-session, 2026-09-20: "好吧1. 去吧" (implement #1008 now and release it). No
failure branch taken. Every line is a reading; logs are in the session scratchpad `release1008/`.

**What shipped:** database migration `0234_legal_enforcement_mode` and a new web version. The runtime
image did NOT change: `git diff --name-only ede1df83 dd3f8f1d -- packages/runtime` is empty, so the
serving image `refresh-ede1df83` stayed, restarted inside the window.

| Step | Reading |
|---|---|
| Gates | PR #1011 merged → `main` `dd3f8f1d202b6eade2211f33c34f263d033768f1`; `ci` green on the PR (lint, build, db-estate incl. the from-scratch chain 0001→0234, db-live-gates, render-drill, db-split-partition-total); the PR head's tree is identical to the merge commit's (`git diff --stat` empty); `git status --porcelain` empty |
| Auth, probe | `tools@belcort.com`; probe `48e0209cdd5948` from `registry.fly.io/clara-runtime:refresh-ede1df83`, world off; destroyed after the post reads |
| Preflight (`ceremony/reads-0234.mjs --prod`, 19:32:25Z) | ledger **228 / `0233_firm_commercial_settings`**; drift gate 228/228; exactly one pending file; **all six prestate pins match hosted** (`_accounting_work_egress_live` `53f69009…`, `prepare_egress_dispatch` `f051fe1f…`, `restore_client_egress_purpose` `97e3f3ee…`, `get_firm_legal_standing` `42fc6a66…`, `consume_egress_dispatch` `f461ceb0…`, `set_admission_capacity` `190d0fe8…`); 0234's names absent; **one operator firm with one active owner** (the door-based rollback to `enforce` is reachable); no non-terminal run, task or Work; no F10 holder. Verdict CLEAN. The script was dry-run first against a local 0233 database |
| Restore point | full dump `packages/db/backups/…2026-09-19T19-33-14-283Z.sql`, **217,318,905 bytes**, ends with pg_dump's `\unrestrict` trailer, carries the 0233 ledger row; globals dump beside it; 62 s; same WSL wrapper and CA workaround as the 2026-09-19 release |
| Web build | detached WSL checkout at `dd3f8f1d`, porcelain empty; version **`42f257ac-193b-4149-a24b-04582597797f`**, tag `refresh-dd3f8f1d`, uploaded 19:33:09Z, not promoted until after the migration |
| Stop | `48ee715b763048` stopped **19:34:32Z**; no lock on the legal or egress relations; no F10 holder (twelve idle pooler sessions of the runtime login were still listed, holding nothing) |
| Migrate | **`migrate: 1 new migration(s) applied · 229 total`**, 19:34:45Z → 19:34:54Z; ledger `applied_at` 2026-09-19T19:34:51Z, checksum `ed995a59f88e…`; prestate, three splices and tail all OK |
| Start | `machine start` 19:35:05Z; **`/ready` 200 at 19:35:26Z**; boot: `frontier=0234_legal_enforcement_mode(229) bodies=55 … chatTurn=chatTurn_v21 claraWork=claraWork_v5`, `stranded bodies n=0`, five bundle banners, `CONTROL listening`, `LEADER acquired`. **Runtime outage 54 s** |
| Promote web | previous active confirmed `c550d944-…` at 100%; `versions deploy 42f257ac…@100%` SUCCESS 19:35:49Z; signed-out smoke as expected (`/login` 200, `/pending` and `/api/build-info` 307→login, registrations 307→`/operator`, cross-origin POST 403) |
| Post reads (19:36:16Z) | ledger **229 / `0234_legal_enforcement_mode`**; `clara.legal_enforcement.mode` = **`prompt`**; census clean |
| The hosted effect | five firms: **2 flip to live** with no owner action (BELCORT, the E2E audit firm: a DPA acceptance from signup, Terms unaccepted); 1 was already live (the 2026-09-13 walk firm); **2 stay not live**: the two SEEDED demo firms (Alara Advisory, Borneo Books), whose owners hold no acceptance at all. That is the rule as ruled: the system never creates an acceptance for a person; each needs its owner to accept once on `/settings/firm` |
| Signed in, owner's Chrome, read-only | `/api/build-info` → `git_sha` `dd3f8f1d…`; `/settings/firm` still reports "legal standing is not current" and now reads: "Please accept the current versions of both agreements. During the beta this does not stop Clara working on your clients' books — it will be required before the official launch." |
| Ticket | #1008 closed with this evidence |

**Not claimed:** no Work was driven through a model dispatch on hosted, so the flip is evidenced by
the rule re-derived from base relations plus the local and CI batteries, not by a hosted dispatch.

**Rollback points after:** DB **229 / `0234_legal_enforcement_mode`** (the mode returns to `enforce`
through `clara.set_legal_enforcement_mode` as the operator firm's owner, no migration; below 0234 only
the dump); runtime unchanged `refresh-ede1df83`; web **`42f257ac-…`** (previous `c550d944-352c-46de-b6f8-cc44b1e52733`,
one command: `pnpm --dir apps/web exec wrangler versions deploy c550d944-352c-46de-b6f8-cc44b1e52733@100% --yes`).
