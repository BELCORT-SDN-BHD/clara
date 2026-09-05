# PROGRESS archive — 2026-09, part 3

*Opened on **2026-09-06**, at the report-disposition truing, for the same reason parts 1 and 2 were:
`PROGRESS.md` could not take the trued Backlog and Known-issues text without breaching the repo's
500-line document ceiling.*

*It holds **both entries of `PROGRESS.md`'s `## Session log`** as they stood before this truing — the
2026-09-04 "BETA WENT LIVE, AND THE SPRINT SESSION CLOSED" entry and the 2026-09-04→05 "THE REPAIR
SESSION" entry — each moved **BYTE-FOR-BYTE** and verified present here before `PROGRESS.md` lost
it. `PROGRESS.md` keeps a pointer in the place of each.*

**md5 of each moved block, computed on both sides of the move:**

| block | lines | bytes | md5 |
|---|---:|---:|---|
| 2026-09-04 · beta went live | 23 | 2304 | `759c32130a33e2584574fcdbd506c6ea` |
| 2026-09-04→05 · the repair session | 28 | 2767 | `fb1f9181f13d71d3444fa62474f73088` |
| Known issues · the 500-line ceiling + host/worktree hygiene | 23 | 2250 | `ee00ad7ca2b8e8ee099f06482fbe99e9` |
| Known issues · the Mail gate and the login-CSRF finding, both TRUED | 11 | 1000 | `55293fd70066d428d3aa7d62b05e999a` |
| Backlog · the four ceremony truings of 2026-09-05 | 7 | 647 | `ee4533413bc33a7ab7f7f0a2a648c3b2` |
| Known issues · `0154`'s role census, the CI half, CLOSED BY MEASUREMENT | 4 | 356 | `eab73a1686b9f07c4812ca7495f460a9` |

**Two more blocks joined them at the 裁-202 commit,** for the same ceiling reason, and both are
PROVENANCE rather than current state. **The third** is a pair of Known-issues bullets whose own text
dates itself — the ceiling bullet's four-document list was "measured on this branch at the final
truing, **2026-09-04**", and the hygiene bullet's worktree count was "measured at **06:20 on
2026-09-04**" and tells the reader to re-walk before touching anything. `PROGRESS.md` keeps the
standing law each minted as a short live bullet: check a file's line count before writing to it and
split or archive first; and re-walk `git worktree list` before touching any worktree, unlinking every
reparse point first because removal is junction-unsafe on this host. **The fourth** is the two TRUED
findings — RISK 50's Mail gate and the confirmation login-CSRF finding — each a closed record whose
one remaining obligation is already carried as a Backlog row (**H-46** the certification call, which
is the owner's; **C-63** the browser-identity re-measurement).

**Two reading notes, in the preamble rather than in the moved text — annotating a moved block
destroys the one thing an archive is for.** (1) The entries' relative links were written from the
repo root, where `PROGRESS.md` lives; from this directory they do not resolve. The ruling ledgers
they cite are [`mohe-grill-rulings-2026-09-04.md`](../active/mohe-grill-rulings-2026-09-04.md) and
[`-pm.md`](../active/mohe-grill-rulings-2026-09-04-pm.md); the beta handover the first calls "the
list" is [`beta-handover-2026-09-04.md`](../active/beta-handover-2026-09-04.md) with its part 2 and
part 3. (2) The repair-session entry's title and closing sentence both say **NOTHING DEPLOYED**.
That was true when written and is now superseded: the ceremony ran on 2026-09-05 and all three arms
are deployed — DB frontier `0176`, runtime **v75**, web Worker `90c1a5d0…`.

---

- **2026-09-04 — BETA WENT LIVE, AND THE SPRINT SESSION CLOSED.** In one continuous sitting from
  22:10 MYT on 2026-09-03: **FS-10** built the OpenNext/Workers artifact in WSL, created the Worker
  `clara-web`, walked it on its preview through eight versions (catching that version H carried FIVE
  of six secrets — read, not assumed — and promoting **I** instead), proved the SSE body genuinely
  streams through the Worker (TTFB 1.83 s of a 6.05 s total, so 裁-151's fallback was never needed),
  and moved `app.clarabook.com` off Pages at **≈00:31**; the real-origin re-walk was clean, so the
  Pages project was deleted in the same sitting per **裁-156** and #540 merged as **`ba8e7d35`** with a
  13/13 sweep behind it. **FS-11** then dropped and rebuilt the whole `clara` schema — a staged drop
  after a single transaction ran out of lock slots, 159 migrations re-applied (through a `0154`
  role-census wall that a live cluster cannot pass without renaming a deploy-minted role), a
  circuit-breaker outage traced to the re-migration silently flipping every ceremonied role to
  NOLOGIN, and a TLS probe that found **four production lane DSNs running in PLAINTEXT** — and BELCORT
  was re-minted through the product's own signup → code → DPA → MYR 0 checkout door, with every
  Stripe event answering 200. The **裁-184 product walk** then ran the real thing on real Malaysian
  documents: a client onboarded through the in-thread interview, a chart planted, invoices OCR'd, the
  agent's witness reads matching the PDF exactly, a journal proposed by Clara and approved by the
  human, a bank line matched and settled, fifteen close gates evaluated live. **Six of eleven
  milestones passed; the statement lane, the unattended coder and the report path failed, and every
  failure was fail-closed with a receipt.** The owner ruled **裁-185** at ≈06:15: **GO, closed beta**,
  and asked for one complete list of everything to repair. Thirty-five rulings 裁-151…185 are in
  [`mohe-grill-rulings-2026-09-04.md`](docs/plan/active/mohe-grill-rulings-2026-09-04.md); the list is
  the handover. **Nine of the fifteen P0 rows were found only because the walk used the real product
  against real documents on the live estate — a mocked e2e would have found none of them.**

- **2026-09-04→05 — THE REPAIR SESSION: EIGHTEEN PRs, TWELVE RULINGS, NOTHING DEPLOYED.** The owner
  opened it at ≈09:00 MYT on 2026-09-04 with three sources and one instruction — his own UIUX flaws
  file, issue **#541** (the authenticated production e2e audit, 36 defects, NO-GO) and the beta
  handover — and it ran into the evening of 2026-09-05. **Fifteen rulings, 裁-186…200**, opened and
  steered it: 186 consent becomes a firm-level declaration at the DPA stage and 187 abolishes every
  attestation ceremony and maker-checker wall in favour of basic RBAC (both **against the
  recommendation**, both minuted as **ADR-0078**, both dissents on file) · 188 the wall-removal DB
  lane · 189 the two deploys as the lead's delegate · 190 native lanes only · 191 two arguable
  document kinds are codeable · 192 the browser smoke becomes a required CI gate (amends 裁-86) ·
  193 the chart applies only after commit (against the recommendation) · 194 the 裁-149 clause-2
  premise correction, the first premise erratum this register has carried · 195 requeue-once · 196
  four readiness and grant items, (b) against the recommendation · 197 three chat tickets queued.
  **Every item in the register was anchored to code before a lane opened**, which is why the fixes
  landed against measured coordinates. All eighteen PRs are merged. **The evening added three more
  rulings:** **198** opens the DB ceremony for `0165`…`0176` that night, gated on the chain landing
  and a 13-job green sweep on the final `main`, in ONE write-quiesce window with the runtime
  stopped · **199** sets the classify gate's floor at NON-REGRESSION per KIND plus zero new
  confident-and-wrong rows, with no absolute number until the first real-corpus run mints a
  baseline · **200** makes the owner's own uncommitted `AGENTS.md` edit repo law — asking him before
  deleting or overwriting a file you did not create now goes through `/grillwithdocs`, and the main
  checkout was restored to `main`'s identical text rather than left dirty, because the codebase
  graph's project id is keyed by that path. **Two session-limit cuts** (≈11:20 and ≈12:58 MYT on 09-04) stopped every running agent
  mid-flight; all were resumed from their transcripts with an explicit instruction to re-read their
  worktree before trusting their last command, and no lane lost work. **The lesson that cost the most:
  merging a docs PR in the middle of a code PR's CI cycle forces that PR to re-update and re-run** —
  under the "head must be up to date with base" rule, docs merge between code cycles or you pay a
  cycle. **The session ended with nothing deployed**, which is the state the next session opens on:
  the DB ceremony first, then v75, then the Worker.

---

## The Known-issues block moved at the 裁-202 commit (2026-09-06)

- **The 500-line ceiling is a WRITE-BLOCKING PreToolUse hook, and FOUR documents this session will
  touch again are at or near it — measured on this branch at the final truing, 2026-09-04:**
  [`docs/adr/README.md`](docs/adr/README.md) **499** (its ruling rows now live in
  [`README-rulings-2026-09.md`](docs/adr/README-rulings-2026-09.md), which has room),
  [`docs/adr/README-log.md`](docs/adr/README-log.md) **499** (445 before the launch night's five
  dated minutes), `docs/plan/active/checkout-gate-design-part2.md` **500**, and the newest ruling
  ledger [`mohe-grill-rulings-2026-09-04.md`](docs/plan/active/mohe-grill-rulings-2026-09-04.md)
  **480**. **That is a SCOPED list, not a repo census** — measured the same way, the repo holds
  **20** tracked `.md` files at exactly 500, **8** at 499 and **31** already ABOVE 500 (historical
  records the hook grandfathers because nothing rewrites them). **A 501st line is refused AT THE
  WRITE, so the next writer of ANY file archives or splits before it adds; check the count first.**
- **Host and worktree hygiene — the census is a WALK, never a list (裁-173).** Measured at 06:20 on
  2026-09-04: **12 worktrees under the .claude/worktrees directory remain from merged lanes, three of them
  LOCKED**; the WSL `.vhdx` compaction is owed again (~50 GB reclaimable at the last measure).
  **Re-walk with `git worktree list` before touching anything** — the count and the names move every
  session. **Removal is junction-UNSAFE by default:** never `robocopy /mir` a worktree without
  `/XJ`, and `git worktree remove --force` and `Remove-Item -Recurse` are not junction-safe on this
  host either (2026-09-01: 2000 tracked files deleted under the main checkout; 2026-09-02: the main
  checkout's `apps/web/node_modules` emptied). Unlink every reparse point FIRST, re-walk to prove none
  remain, THEN remove; post-flight `git status` on main plus `ls apps/web/node_modules/next`. The
  locked ones need an elevated shell after a Claude Code restart, then `git worktree prune`. Two
  standing host facts: the OpenNext/Workers artifact must be BUILT ON LINUX, and **WSL idle-terminates
  without a Windows-side holder** — plant a detached keeper before any port-dependent WSL work.

---

## The two TRUED Known-issues bullets moved at the 裁-202 commit (2026-09-06)

- **RISK 50, the Mail gate — TRUED.** Transport, sender identity and **delivery of a real six-digit
  signup code to a NON-team address** are all proven (FS-10 S21, after an OTP-length fix: the project
  carried `mailer_otp_length` = **8** against the app's six-digit form). Time-to-arrive and the From
  header were asked and **are not recorded**, and FS-11's own code went to a TEAM address — so the
  ceremony's certification line is the owner's call, carried as H-46.
- **The confirmation login-CSRF finding — TRUED.** The always-refusing stub is gone; the wall is wired
  for real by FS-4 C-6 Lane B (#517) and answered in the field (one attempt, accepted, 167 ms). What
  is carried is a **re-measurement** of the browser-identity half plus the `token_hash`-in-logs and
  replay siblings (handover part 2, C-63). **Closed in the same breath: the `__Host-clara-auth`
  HTTPS deployed-origin acceptance line** — the origin serves HTTPS on the Worker and the cookie
  landed in the field.

---

## Two more Known-issues blocks moved at the 裁-202 follow-up commit (2026-09-06)

*Both were named by the lead as purely historical and CLOSED. Neither carries an open item away:
the role-census block says in its own last sentence that **the LIVE-cluster half is open as H-47**,
which is its own Backlog row, and the ceremony-truings block is a record of reads already written
into the 2026-09-05 as-run. **One disclosure:** the ceremony-truings bullet was COMPRESSED in place
at the 裁-202 commit (nine lines to seven, no fact dropped), so the bytes below are that compressed
form, md5-proved on both sides of THIS move. Its uncompressed 2026-09-05 wording is not preserved
anywhere as a block; the underlying reads are in the ceremony as-run, which is their source.*

- **TRUED by the ceremony's live reads (2026-09-05), each previously stated otherwise:** **(a)** only
  `bank` is skipped on `/ready` (`dsn_not_configured`), not three lanes — `stripe_webhook` and
  `auth_wall` probe healthy · **(b)** the Worker carries **FOUR** env vars, not three
  (`CLARA_PUBLIC_ORIGINS`, `CLARA_RUNTIME_URL`, `CLARA_STRIPE_LIVEMODE`,
  `CLARA_TRUSTED_CLIENT_IP_HEADER`; six secrets is right) · **(c)** the `clara-backup` one-off machine
  id in `wave-b-0019-ceremony-runbook.md` is CURRENT, re-read live · **(d)** `clara.agent_tasks` has
  **no** `last_refusal` column; it is on `clara.autodraft_attempts` (`0011:712`).

- **`0154`'s cluster-wide role census, the CI half — CLOSED BY MEASUREMENT.** #525 derived the roster
  from `packages/db/deploy/roles-bootstrap.sql` and pinned it, and four hosted sweeps since
  (33712469717 · 33723755257 · 33757365379 · 33781966143) came back 13/13 green including
  `closed-wave-drills`. **The LIVE-cluster half is open as H-47.**
