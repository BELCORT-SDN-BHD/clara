# The frontend-sprint work orders — 2026-08-31 (companion to the handoff)

*Each order is self-contained per `.claude/rules/handoffs.md` and inherits, verbatim, §0 of
[`fe-train-plan-2026-08-30-orders-p4.md`](fe-train-plan-2026-08-30-orders-p4.md) (read order,
rung-0 at the live body, worktree + junction mechanics, the four verify commands, the instrument
laws, the design-resources rule) plus §A below (the review ladder under 裁-84). Sizes are P3-lane
units. Where an order says "rung 0", census the doors at the LIVE body on a throwaway rig before
writing a line.*

## §A · The lean ladder under 裁-86 — how every PR in this sprint is built, walked and reviewed

0. **Dispatch by fit (裁-85):** the orchestrator picks the lane per task — Codex `gpt-5.6-sol`
   xhigh for execution-heavy implementation/debugging/test-fixing, native sonnet-5 xhigh for bounded
   work, opus-5 xhigh for judgement — every dispatch pinned (model + effort), every git-active lane
   in its own worktree, heavy lanes capped at 3–4. A family that is out is substituted for that leg
   (builds included) and the PR body says so. **裁-133 (owner, 2026-09-02, until beta live): there is no Codex lane of any kind, builds included — for the remainder of the sprint this step reads sonnet-5 xhigh for bounded, mechanical, objectively testable work and opus-5 xhigh for judgement, security, ambiguity and every review; see §C.** Note the difference from the sentence above it: "a family that is out is substituted" describes availability, and 裁-133 is a RULING — out ≠ forbidden.
1. Build; the four verify commands green; a RED-before proof per wall recorded in the PR body
   (mutant → which cell went red).
2. **The e2e leg (frontend trains):** `pnpm --filter @clara/web build` → `next start` → a real
   browser (Playwright) walks the train's journey end to end **on the BUILT app** — against
   `apps/web/e2e/serve-built.mjs`'s **mocked** Supabase and runtime by default (no DB, no firm behind it at all), or
   against a throwaway test firm through `apps/web/e2e/live-stack/` where the journey needs a real backend;
   **the PR body says WHICH shape it ran** (7 of the 8 browser legs merged on 09-02 were the mock shape).
   The axe scan rides the walk; the script is checked in under apps/web/e2e/ (the first train, FS-2,
   creates the suite) and its run is quoted in the PR body. `next dev` is not the app.
3. Push; open the PR with a body that carries: the rung-0 census table (door → live body → args →
   refusals → grant) · test counts control vs branch by name · every new door call and its surface
   · the e2e run · the skills/MCP line · what you could NOT verify and why.
4. **The independent leg:** ONE fresh-context **opus-5 xhigh** read-only review in its own context
   (a subagent that did not build; the prompt names the PR, the design of record and the acceptance
   list, asks for findings as BLOCKER / MATERIAL / NIT with `file:line`, a refute-first stance, an
   explicit attempt to bypass every wall the PR claims, and a verdict `CLEAR` / `FIX REQUIRED`).
   Money/auth/webhook/tenant-creation surfaces get the security lens in the same prompt.
   **裁-111 (2026-09-01): the cross-family Codex adversarial leg is SUSPENDED until beta live** —
   the ONE fresh-context opus review is the complete gate for the sprint; law 28 resumes at beta
   unless the owner rules otherwise. The reviewer brief carries two standing items: the
   bidirectional seam↔door parameter diff in the PR BODY (裁-107/107b) and the OVERCLAIM lens —
   does anything in this diff assert an absolute where the code delivers a conditional? (裁-112)
5. Fold on the same branch; the SAME reviewer re-verifies to `CLEAR`; the owner may read the PR;
   `gh pr merge --squash` on green CI. Never `--admin`; a stale branch takes `gh pr update-branch`.
6. Docs-only PRs (`AGENTS.md` / `PROGRESS.md` / `docs/**` only) take the single-lane review
   (ADR-0069); the CI path classifier decides, never the author.

## §B · (Optional, 裁-87) Mounting the design and Stripe MCP servers in a Codex lane's ~/.codex/config.toml

The orchestrating Claude session holds these connectors itself (`.mcp.json` + the claude.ai Stripe
connector) and does the grounding; a Codex lane mounts them only when its order needs a direct
Mobbin or Stripe call. Claude's `.mcp.json` is not read by Codex. Measured 2026-08-31, `codex mcp list` shows github ·
playwright · context7 · vercel · openaiDeveloperDocs · the zoom family — **no mobbin, no shadcn, no
codebase-memory-mcp, no stripe.** Add, in ~/.codex/config.toml (Windows paths as single-quoted TOML
strings; the key placeholder is ENV-ONLY — never the value, never in the repo):

    [mcp_servers.mobbin]
    url = "https://api.mobbin.com/mcp"

    [mcp_servers.shadcn]
    command = "cmd"
    args = ["/c", "npx", "shadcn@4.12.0", "mcp"]

    [mcp_servers.codebase-memory-mcp]
    command = 'C:\Users\zhant\AppData\Local\Programs\codebase-memory-mcp\codebase-memory-mcp.exe'
    args = []

    [mcp_servers.stripe]
    command = "cmd"
    args = ["/c", "npx", "-y", "@stripe/mcp", "--tools=all"]
    [mcp_servers.stripe.env]
    STRIPE_SECRET_KEY = "<the owner's TEST-mode restricted key — env only>"

Verify each with `codex mcp list` (status enabled, auth as the server requires); the Stripe server's
exact invocation (local `@stripe/mcp` vs the remote OAuth endpoint at mcp.stripe.com) must be
confirmed against the current official Stripe MCP docs through context7 before the first call — the
snippet above is the shape, not a remembered fact. The `codebase-memory-mcp` project name is
`C-Users-zhant-Desktop-clara-rebuild` (`docs/references/codebase-memory-graph.md`).

*(§B is DORMANT until beta live: 裁-133 suspends every Codex lane, builds included — see §C's
first paragraph and AGENTS.md's working protocol.)*

## §C · The lane laws minted 2026-09-02 / 09-03 — every lane spawned from these orders inherits them

*Each paragraph below is one law and one day's price. They extend §0.5's instrument laws
(`fe-train-plan-2026-08-30-orders-p4.md`), which every order already inherits; nothing here
replaces them. The days' rulings are in `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md`
(裁-132…145; 裁-129…131 are in the `-09-02` file it continues) and, from 裁-146, in
`docs/plan/active/mohe-grill-rulings-2026-09-03.md` — the newest.*

**Native lanes only (裁-133, owner, 15:50).** Until beta live launch there is no Codex lane of any kind — builds included. Every lane is native: sonnet-5 xhigh for bounded, mechanical, objectively testable work; opus-5 xhigh where judgement, security or ambiguity dominates, and for every review. The Codex REVIEW leg was already suspended by 裁-111; both resume at beta live unless the owner rules otherwise. Fable stays the orchestrator, and the 3–4 heavy-lane host cap still binds — native lanes run the same suites.

***The 2026-09-02 clauses were MOVED on 2026-09-03 to `frontend-sprint-handoff-2026-08-31-orders-c-archive-2026-09-02.md` — a sibling in this directory — and they BIND IDENTICALLY:*** the PROCESS LAW (kill by the PID you captured, never by a name or a CommandLine substring) · the FOLD-ROUND DELIVERABLE (every fold round ships a mutant panel) · the MUTANT-PANEL RESTORE LAW (buffer-restore, never `git restore`, on an uncommitted tree) · PRINT-THE-THING · the eight-item MERGE-FORWARD LAW · MERGED-TREE · GATE-SHAPE · ARMED-PR · and the two standing riders. Only their physical home changed: this file stood at exactly 500 lines, which the PreToolUse max-file-size hook refuses to exceed, so the day's new clauses forced the move. Read them there before your first push.

**MUTANT-PANEL LAW, second clause (09-03 ~00:30).** A mutant's RED is read for its REASON, never its colour. #519's M27 moved a door's floor inside a migration body and reded — for an unterminated dollar-quote, because `String.replace` with a STRING replacement interprets `$` patterns and turned the `$$` body opener into `$`. A non-discriminating mutant wearing a discriminating result is the expensive direction. So: any replacement text containing `$` goes through a replacement FUNCTION; every panel row prints the failing cell's NAME and its assertion message; and a RED whose message names something other than the property under test is NOT a pass. A guard that is its own instrument — a drift guard, a census — carries a positive control before it is trusted.

**FROZEN-TREE clause (09-03 ~00:40).** A suite running on a worktree OWNS that tree: never edit it mid-run (Q-D6's first branch run was destroyed by exactly that). But a lane does not wait hours for a control run to free its tree either — fold in a SECOND worktree of the same branch, junctioned the same way, or run the control side on a throwaway worktree, so measuring and editing proceed in parallel. A lane that is serialising behind its own pair says so in a report AT THE TIME, not when asked three hours later.

**PRINT-THE-THING, second clause (09-03 ~01:10).** On Node 20.19 a cell cancelled by its parent — a hung promise that never settles takes every sibling with it — prints `not ok` but is NOT counted in `# fail`: a two-cell probe printed `# tests 2 / # pass 0 / # fail 0` and EXIT 1. CI is fail-closed on the exit code, so a lane script that reads only the `#` totals calls that suite GREEN. The honest reads, always together: the exit code, `# pass` against `# tests`, AND the `^not ok` lines. And a never-settling stub must honour its `signal` (a real fetch rejects on abort) and carry a fuse with a DIFFERENT error name, so a timeout mutant reds on the identity assertion instead of hanging the file.

**ABSENCE-CENSUS clause (09-03 ~01:15).** An absence census scans the tree it guards, so a sentence DESCRIBING the census must not live inside that tree with the needle spelled out — #512 named the SDK's signed-URL minting calls in a comment under the scanned path, and its own cell reported the comment. The literal identifiers belong ONLY in the instrument's needle list; prose elsewhere names the class in words. Scanning comments is the RIGHT design (a comment is where the next developer copies from) — say so beside the cell, and give every absence census a positive control (a planted needle in a scratch file under the scanned path must red it) plus its stated scope (the globs it walks).

**BACKGROUND-VERIFIER clause (09-03 ~01:34).** A backgrounded verification run is UNPIPED and teed to a file — a `grep` in the pipeline holds every line until the process exits, so "0 bytes" reads identically to "still running" — and a run whose webServer is a CHILD process is confirmed DEAD before the next attempt: a leaked `next start` on the lane's port makes Playwright fail fast with "port already used", which looks nothing like a test failure and hides behind a buffered pipe (#519's browser leg "ran" three times and never ran once). Liveness is read with `Get-Process`, never `tasklist` through Git Bash, which returns nothing on this host — **and BROWSER liveness by EXECUTABLE PATH** (`Get-CimInstance Win32_Process` filtered on an ExecutablePath under ms-playwright), **never by process name**: Playwright 1.62 runs chrome-headless-shell.exe, so `Get-Process -Name chrome` reports ZERO while four browsers are alive, and a #519 lane read a live run as dead exactly that way. Zero ms-playwright processes means a run is FINISHED or DEAD, never "in flight". A leaked child is killed by PID after an OWNERSHIP check — the PID from `Get-NetTCPConnection` on YOUR port, its CommandLine from `Win32_Process` matching YOUR worktree path AND your port, then `taskkill /PID <pid> /T`. Never a name, never a substring.

**EXACT-NAME clause (09-03 ~01:34).** `docker ps --filter name=<x>` is a SUBSTRING match: `name=qd6-rig` lists `revqd6-rig` too, so a "my rig is still up" post-flight can read a SIBLING's rig as a failed teardown — and tempt the removal of a held one. Verify teardown by EXACT name (`docker ps -a --format '{{.Names}}'` matched with `grep -x`, with the volume id recorded before removal), and never remove a container whose name is not exactly yours. The PROCESS LAW one layer down: a substring is not an identity.

**POSITIVE-CONTROL clause (09-03 ~01:22).** A positive control CALLS the instrument it defends — the same function, on a fixture the instrument scans: one file with a planted needle must produce a hit, a clean one zero. A control that retypes the needles, or asserts a literal against itself, cannot see the instrument's list emptied or its walker broken — with #512's census GUTTED and a real needle planted in scope, the cell was green and its control still passed. The reviewer's acceptance for any absence census is therefore the gutted-instrument arm: gut it, plant a needle, the CONTROL must red. Same rule as the doors — execute the gate, never a copy of its predicate.

**REVIEWER-WORKTREE note (09-03 ~01:19).** A read-only review worktree INSIDE the repo (`.claude/worktrees/<name>`) resolves `pg` and the other workspace packages by Node's upward walk to the root pnpm store, so a reviewer that only reads and runs `packages/db` tests needs NO `node_modules` junction — and the worktree-remove hazard goes with it. Build lanes that run `next build` or the WDK build still junction per the mechanics above. Beside it, a panel rule: a mutant arm whose mutation ERRORED before landing reports GREEN, so every arm asserts the mutation APPLIED (re-read the body or the catalog) before its result counts.

**SAME-DAY ROT (D1, 09-03 ~03:00 — seen six times in one scan).** A truing's measurements are only as fresh as the tip it shipped from, so the mechanical sweep is the LAST act before the PR, never the first, and every "TRUED &lt;date&gt;" stamp carries the sha it was measured at — a row written at 05:16 and fixed by a merge at 14:10 the same day is not a stale document, it is a document that was never stamped.

**MERGED IS NOT SERVING / APPLIED / SEEDED (D2, 09-03 ~03:00).** Every state row that names a version, a migration or an external object names BOTH the repo fact and the live fact, and a deploy, apply or seed act is its OWN tracked row — never implied by a merge. Three live instances the same morning: main pins `chatTurn_v17` while the machine serves v16, `0154`–`0160` are merged and unapplied, and the Stripe Product and Price exist in the dashboard while nothing has written `stripe_object_map`.

**A WRONG EXAMPLE INSIDE A CORRECT LAW (D3, 09-03 ~03:00).** An illustration inside a law is verified like the law: a named file, verb, env var or credential in a ruling gets ONE measurement before it ships, because every downstream copy inherits it — 裁-114's ruling is right and its example named the wrong secret, and the wrong example propagated into PRD §6 and ARCHITECTURE §1 and contradicted 裁-93, an EARLIER ruling on the same question.

**WRONG-INSTRUMENT ABSENCE (D4, 09-03 ~03:00).** An absence claim names its instrument AND its scope in the same sentence — and for "already recorded / already in the pending PR" the instrument is **the PR DIFF at its current head**, never the scratch notes and never a file list read an hour ago. The scan lost findings in both directions to this: an a11y census scoped to a FILE when the gate is the SUITE, a grep of the tests directory when apps/web keeps tests beside components, an unscoped `grep -r` walking `.next`.

**HALF-EXECUTED RETIREMENT (D5, 09-03 ~03:00).** A retirement closes BOTH halves in ONE PR — the thing, and every caller, record, backlog row and instruction that names it — and the PR body carries the census that proves the second half is empty. Live exhibits: `0118` dropped a function and left its runtime caller re-firing every two seconds; the WSL fleet was parked while three documents still cited it as current.

**THE CLOSED ENUMERATION IN AN INSTRUCTION (D6, 09-03 ~03:00).** Never write a closed count or list into an instruction a later PR can extend: name the source of truth and the command that counts it — **count the file, not this line** — or accept that the list is a dated measurement and stamp it as one. "Exactly /signup and /auth/confirm" would have deleted the entry that makes password recovery work.

**A `live` RECORD PINNED TO AUTHORING TIME (D7, 09-03 ~03:00).** A plan record whose index Status is `live` carries a re-measure banner naming the tip it was measured at, and its index row summarises the BANNER, not the measurement — otherwise a record filed at 06:10 and falsified by 14:19 keeps being read as current state and consumed as a gate.

**STATE-BANNER clause (09-03 ~01:15).** A truing PR's state lines — the open-PR queue, review verdicts, armed/disarmed, "N of M legs" — are measured from `gh` AT COMMIT TIME and stamped with that time, and the lead's notes are read to their END before the commit (a verdict ten minutes old was missed). Every "N of M legs green" counts the meta-gate as a job and names it. A stale state line in a truing PR is a MATERIAL finding, not a nit: the reader acts on it — a queue row that omits which PR is ARMED misroutes the merge order. **Stamped at commit time AND re-read once after the push — the window between the last gh read and the push is where a merge lands. If the re-read moves a row, amend, re-push, and re-stamp; if it moves again, that is DRIFT — name it as drift in the PR body and stop. A truing PR converges, it does not chase.**

**BROWSER-LEG clause (09-03 ~04:30).** The e2e leg is the REVIEW LANE'S OWN Playwright run on the built app — hosted CI carries **no browser leg at all**. Measured, not assumed: `playwright` appears **zero** times in `.github/workflows/ci.yml` and zero times under `.github/actions/`, and the single occurrence of `browser` in the workflow (`ci.yml:321`) is about `next build` inlining env values into browser bundles — it is not an e2e leg and must not be read as one. A green pipeline therefore says nothing about whether the journey works, and CI never substitutes for the walk: every frontend train's leg is run by a human-directed lane on `next start` against the built app, and its output is quoted in the PR body. Read the workflow before citing it — "CI runs the e2e" is the kind of claim that survives review because everyone assumes someone checked.

**TWO-CLOCK DATE clause (09-03 ~01:15).** Never assert equality between a date derived from one clock (`current_date`, `now()::date`, JS `new Date()`) and a stored timestamp cast to a date under another: hosted runs sit in UTC while the rig or session may sit in MYT, and between 16:00 and 24:00 UTC the two days differ — every Malaysian evening. Derive the expected date from the SAME source and timezone the stored value is cast in (read `now()` in the same statement; cast both `at time zone 'UTC'`); never widen the assertion to "either day". From `3989cb87` on: a red on R9.E2 on a branch that has NOT yet merged forward onto the fix is a RE-RUN after merging forward, never a diagnosis; on a branch that CARRIES the fix it is a NEW defect and is diagnosed.

**PORT-ASSIGNMENT clause (09-03 ~04:30).** Every lane that starts a server names its port RANGE in its work order and uses only that range, and the lead assigns ranges disjoint across live lanes (3180–3182 were #510's, so rev-p6-5 moved to 3190–3192; C-5 took 3210–3212 and Lane B 3220–3222). On "address already in use" the owner is resolved BY PID first — `Get-NetTCPConnection -LocalPort N` for the `OwningProcess`, then that process's ExecutablePath and CommandLine — never by name, never by a CommandLine substring, and never by taking the port: move to your own range, and if the owner is another lane's e2e leg, WAIT for it to finish before taking a deciding measurement, because a Playwright run under another leg's contention measures the host and not the tree. One Playwright leg at a time on this host stays the law.

**RIG-READY clause (09-03 ~05:12).** `pg_isready` is not readiness: a fresh `postgres:17` container answers ready about a second in, then restarts after initdb, and the first `migrate` dies with "Connection terminated unexpectedly". Gate a rig on an actual `select 1` through the SAME client the suite uses, retried until it answers, and print the gate's own line — never on `pg_isready` alone. Beside it: **every rig that predates a migration RENUMBER is DEAD**, because the runner refuses a database whose applied migration is missing from disk, so a re-verify after a number claim is always a from-scratch container and never a re-used one.

**ASSERTED-REPLACEMENT clause (09-03 ~05:05).** Every scripted replacement — a PR-body edit, a citation re-cut, a rename sweep, a `sed` or a `String.replace` — ASSERTS that it applied EXACTLY ONCE (count the matches before, count after, fail on 0 or on more than 1) and PRINTS the counted line. A plain replace with no assertion reports success whether or not it did anything: truing-pm's "Five commits" sentence survived one such edit and was caught only when the next edit asserted. This is PRINT-THE-THING applied to the instrument's own effect — the same class as a mutant arm that never landed and still reported green.

**GATE-SHAPE LAW, second clause — the CLUSTER census (09-03 ~05:57).** A cluster-wide side effect (a role a migration mints, a shared catalog row) is a hazard for EVERY step on that cluster that migrates from scratch after it — not only for the callers of the sweep that cleans it. #518 swept between the `closed-wave-upgrade-drills` steps; the same D-b kits under the `frontier-leg` action fell next (#524 r1), and then a THIRD action, `wave-e-contract-drills`, whose second from-scratch migrate met `0154`'s absolute role-count pin (14 → 16) — each in turn, because the census asked *"who CALLS `sweepChainMintedRoles`"* instead of **"which JOB migrates from scratch more than once on one cluster"**. So a fix to a cluster-shaped hazard carries a census of the CLASS across `.github/`, grouped by job: every from-scratch migrate after the first in a job has a sweep before it, or the body says why not. Its only proof is the post-merge hand dispatch of the sweep-only legs.

**CONDUCTOR law (09-03 ~09:33).** The repo is strict-up-to-date on `main`, so every merge knocks every sibling BEHIND and a BEHIND branch never auto-merges: the merge order is CONDUCTED, not raced. A serial conductor reads a live-re-orderable queue, takes the FIRST entry that is OPEN and ARMED as current, `update-branch`es it while it is BEHIND, and touches nothing else — **it never ARMS**, and a PR that is draft, unarmed or DIRTY is the lead's and is skipped. **Second sentence (09-03 ~12:22, from the lead's own arming of #526 mid-run).** Under strict up-to-date, **ARMING is the act that spends a CI cycle**: a docs-only PR armed while a code PR's run is in flight merges in two minutes and knocks that code PR BEHIND, restarting its 20-minute run. The lead arms a docs-only PR only when **no armed code PR is mid-run** (BLOCKED = running) — i.e. right AFTER a code merge — and **the conductor cannot enforce this**, because auto-merge fires from GitHub the moment an armed, up-to-date PR goes green. #526 armed at 12:21 cost #511 one full run. Run the conductor DETACHED from the tool timeout (a backgrounded Bash tool call dies at ten minutes): the 09-03 conductor outlived a session-limit cut and merged four PRs unattended — #519, #522, #501 and #510 — which is safe precisely because ARMING IS THE LEAD'S OWN ACT after a CLEAR verdict, so the merge grant (green CI plus a clean review) had already been given for every one of them.

**ENUMERATE-NOT-COUNT clause (09-03 ~09:36).** A count question is answered by ENUMERATING the set, never by a line count: `grep -c` counts matching LINES, not occurrences, so any array whose entries share a line is undercounted. #493's role census — a README saying 18 against a reviewer saying 19 — was settled only by naming every member (11 group roles plus 7 login roles in the migration's arrays, plus `clara_storage_docs` the file creates itself): one set, counted two ways, and no `grep -c` over those arrays could have told them apart. Print the names, then derive the count from them; a bare number in a report is a claim without its instrument.

**STACKED-COPY clause (09-03 ~05:00).** A branch stacked on an unmerged sibling may carry a COPY of that sibling's migration under a number the sibling later loses; at the re-merge it DELETES the copy, takes main's file, and claims its own number — and the acceptance is mechanical: the branch's diff against `main` under `packages/db/migrations/` lists exactly its OWN file and nothing else. #517 carried C-3's body as `0161_…` (+1178 lines) while main landed that body as `0163`, and a blanket `0161`→`0164` sweep would have been wrong in all 23 places (C-3's citations resolve to `0163`; only the branch's own file becomes `0164`). Measure the stacking BEFORE the merge-forward and name in the report which sibling files your branch carries.

**ROLE ⇒ ROSTER clause (09-03 ~10:50, from sweep #2's drill red).** A migration that mints a role (`create role clara_…`) joins `packages/db/deploy/roles-bootstrap.sql` — the existing estate law — **AND** the cluster-reset roster `CHAIN_MINTED_ROLES` in `packages/db/tests/rig-cluster-reset.mjs` in the SAME commit; or the roster is DERIVED from the bootstrap file so that there is one source instead of two lists that can disagree. #493's `0163` minted `clara_auth_wall` and `clara_auth_wall_login`, the between-step sweep left them ("unrecognized … untouched") because the roster is a literal list that had never heard of them, and the next from-scratch migrate died one step later on `0154`'s absolute role-count pin. **#525 (`7422576f`, 09-03 11:43) took the derivation branch** — the roster is now derived from the bootstrap file and pinned by `packages/db/tests/chain-minted-roles-drift-guard.test.mjs` — so a reviewer of any migration that mints a role RUNS that cell. And a sweep that meets a `clara%` role it does not know **FAILS CLOSED naming the role**: a warning that defers the failure to a cryptic place downstream is a false pass.

**STATE-LINE rule (09-03 ~05:30, #520's NEW-12).** One state, ONE copy: a `PROGRESS.md` Lanes or Next line states the STEP and the RULING and then points at the banner — *"tip and arming: see the banner"* — and a commit sha, a review verdict and an armed/disarmed fact live in the BANNER only. #520 converted the #493 / #509 / #519 rows that way and left four clauses still restating a tip; all four had already diverged by the time it merged. A row that restates a moving fact is a second copy of the state, and the second copy is always the stale one.

**ONE-AUTHOR clause (09-03 ~13:32).** `PROGRESS.md` — and the orders' §C, the ADR digest and its rulings sibling, and the ruling ledgers — are edited by the **TRUING lane only**. A build or fix lane never touches them: it puts its CLOSURE LINE in its PR body and its report — the Known-issues or Backlog row it resolves, in that row's own words, with its PR number and "merged, not serving until `<deploy>`" wherever the D2 law applies — and the lead hands it to the next truing's opening list. Two PRs editing `PROGRESS.md` in one window conflict at merge and break the STATE-BANNER discipline, which is one author, one measurement, one re-read. Minted after two lanes reached for the file in a single afternoon.

**PORT-ASSIGNMENT, second sentence — the ORIGIN clause (09-03 ~13:45).** A Playwright spec follows `baseURL` for its page-driving half, but a **hardcoded origin inside its own `page.request` calls dials the OLD port** — so on a reassigned range the spec looks HALF-ALIVE: page cells green, request cells red on `ECONNREFUSED`, which reads like a defect and is not one. Every spec reads `CLARA_E2E_APP_ORIGIN`; a lane assigned a range greps its specs for a literal port BEFORE it reads a red as a defect, and a reviewer enumerates the literal-port sites (`grep -rn "3100"` over the e2e tree) as part of the browser leg. **Corollary:** an origin fix sweeps the WHOLE FILE for every literal host, not just the const — a `not.toContain("127.0.0.1:3100")` one screen below the fixed const is VACUOUS on every other port (an injected defect stayed green 55/0), so derive the needle from the origin (`new URL(APP_ORIGIN).host`) and inject the defect the cell exists to catch, on the assigned ports, before accepting the fix.

**ARTIFACT-IDENTITY · BINARY-SAFE-GREP · BARE-ROUTE (09-03 ~13:55, three faces of one afternoon).** **(1) Identity is read ON THE MACHINE.** `fly deploy --remote-only` builds remotely, so the served bundle is NOT the local build of the same commit (measured: 8,772,597 B / sha `5dbbbaff…` served vs 8,772,097 B / `4582a5ca…` local — 500 bytes apart, identical counts). A deploy record states the SERVED identity (bytes + sha256 read over `fly ssh`) and, if it names the local build at all, names it as a DIFFERENT artifact. **(2) Count a bundle with `-a`.** Plain `grep -o` on a binary-classified file SUPPRESSES its output while `grep -c` still counts lines, producing "occurrences < lines", an impossibility that shipped twice in one day. Use `grep -ac` for lines and `grep -oa … | wc -l` for occurrences, and LABEL which form each number is. **(3) Only TRACKED repo paths go in backticks in tracked markdown.** harness-links reads any backticked span containing a slash as a file path and reds the PR; routes, URLs, build outputs, container paths and remote paths are written BARE — the allowlist is for regenerated text, not for prose. A document unreachable by the hop today (a new as-run) is still armed to red the truing PR that first cites it, so census the file for backticked slash-spans and PLANT the future citation in a throwaway before pushing. **(4)** The lead's own fold lines get the same MEASURE-BEFORE-WRITE rule as a lane's — two folds in one afternoon each carried an unmeasured claim.

**BACKGROUND-VERIFIER, the SATURATION half (09-03 ~13:20, the half that never reached this file).** Host **saturation** is the processor queue length against logical CPUs plus free RAM (119–202 on 24 at 60 % CPU with 3.5 GB free = saturated) — the condition under which Chromium sessions die mid-assertion (`Protocol error … session closed`, `net::ERR_ABORTED … frame was detached`). Those are INFRASTRUCTURE reds, not behaviour: re-run the reded specs alone twice, and a red that survives isolation is the lane's. A Playwright run taken under another leg's contention measures the HOST, not the tree, so **one browser leg at a time on this host** stays the law and a lane waits for a sibling's leg rather than taking a deciding measurement beside it.

**PORTABLE-INSTRUMENT clause (09-03 ~14:00).** An instrument left "beside the review for the fold" is reusable only if it takes its tree as an ARGUMENT (`--repo <path>`, or `process.cwd()`), never a fixed checkout path: a REF-addressed script (`git show <ref>:file`, correct in itself) that runs from the main checkout's cwd hits a worktree's isolation guard when a folder tries to use it — and the guard is RIGHT to refuse. Reviewers parameterise the root and say so in the report; folders reproduce the proof with their own instrument rather than editing another lane's script, and NAME the substitution in the report.

**MUTANT-PRODUCES-THE-VALUE clause (09-03 ~14:12).** A mutant proves a cell only if it PRODUCES the value the assertion hunts for. One injection stayed green 55/0 — not because the assertion was inert but because `request.url` carries the INTERNAL dev-server port while the needle is the PUBLIC origin's host: the strings could never match, so the green proved nothing in either direction. Before reading a mutant's green as "the fix does not work" (or a cell as vacuous), PRINT the value the mutant actually delivers to the assertion and show it is the hunted one. Record a discarded mutant and its reason; never replace one silently.

**ONE-TEARDOWN clause (09-03 ~13:03, AMENDED ~14:45 when the mechanism was settled).** The clause stands as HYGIENE — one teardown registrant per resource; a shared testkit exports a plain close instead of registering its own top-level `after()`; a `DROP DATABASE … WITH (FORCE)` is issued only after that resource's close has been AWAITED. But it was minted on a WRONG causal claim, and the correction is the load-bearing half: **two root `after()` hooks do not race** (node:test 20.19.5 runs them sequentially in registration order, re-measured). The CI `FATAL: terminating connection due to administrator command` class is instead: pg-pool's `pool.end()` resolves BEFORE the sockets close (fire-and-forget `client.end`), so a FORCE drop immediately after kills a still-attached idle backend → 57P01 on that socket → a pool with no `'error'` listener re-throws → `uncaughtException` → the FILE reds though every cell passed. It bites under CI's db+runtime concurrency on 2-core runners and almost never on an idle 24-core host. So: (1) before any FORCE drop, **DRAIN** — poll `pg_stat_activity where datname = $1` to zero with a bounded deadline; FORCE is the backstop, never the plan; (2) a teardown that ends a pool attaches a **window-scoped** `pool.on('error')` so a straggler's FATAL is reported rather than thrown; (3) **a lane whose RED-before does NOT red stops and re-diagnoses before writing any causal claim into a shared file** — a hook that runs after the error cannot cause the error, and the lane's own 0/20 said so.

**CONDUCTOR law, third and fourth sentences (09-03 ~14:02 and ~16:02).** **Third — the OVERTAKE rule:** while an armed PR's run is in flight, arm NOTHING that is UP-TO-DATE with main, docs or code. An up-to-date PR whose run greens first MERGES first and knocks the armed one BEHIND — a full run wasted. A BEHIND PR may be armed at any time (it cannot overtake; the conductor sequences it by queue order after the current merge), so a CLEAR verdict on an up-to-date PR is HELD — recorded, not armed — until the current armed PR merges. **Fourth:** the merge state is **READ in the same call as the arming** (`gh pr view --json mergeStateStatus` printed beside `gh pr merge --auto`), never assumed from queue position — a fold lane's merge-forward silently makes a PR UP-TO-DATE, and an armed up-to-date PR with a code-scored run in flight is the overtake shape exactly. If the read says BLOCKED/CLEAN while another armed run is mid-flight, disarm and re-arm after that merge.

**MECHANICAL-KEEP-BOTH clause (09-03 ~18:00).** A keep-both resolution of two PRs colliding at a file's TAIL is done by TOOL, never by retyping either side: `git checkout --theirs <file>` for the side that must stay whole and then append yours, or take yours and apply the other side's hunk as a **zero-context patch** (`git diff -U0 … | git apply --unidiff-zero -`; a normal apply fails on the EOF context). Prove it: content md5s of BOTH sides' regions, captured BEFORE the merge, match at the MERGE commit; the fold that follows is a SEPARATE commit read as a diff; the other side's region — the CONTROL — still matches at the tip. A reviewer captures those baselines outside the run being checked, and adds a **gate-sentence baseline** (the one sentence that must survive a legitimately-rewritten line) wherever a ceiling forces text to grow WITHIN a line rather than by lines.

**THE DEPLOY-LOCK KEYS ON THE IMAGE (09-03 ~13:38).** A frozen-workflow manifest's deploy-lock is decided by what is IN THE IMAGE, never by the ceremony's headline closure: **every entry merged before the deploy's build commit ships in that build**, whether or not it belongs to the closure the deploy is named after. A ceremony record that stamps only its own headline entries leaves the rest re-baselineable with CI green — the shipped gate was executed and proved exactly that on a serving body. So a deploy-lock census enumerates every manifest entry added since the last full lock, judged by MERGE TIME against the build commit, and the runbook's own `--lock-deployed` does the stamping.

**PREDICATE-COPY, second instance (09-03 ~13:47, 裁-112(c) applied to a gate's own selftest).** A selftest whose cases hand-compose the entry list the shipped `main()` composes is a COPY of the predicate: unwire discovery inside `main()` and the gate prints a truthful-looking banner, exits 0, and the selftest stays ALL GREEN. At least ONE cell must drive the EXPORTED entry point against a fixture (broken → non-zero, clean → zero). This was the day's third instance of the same class, after a sentinel and the truing's own state line — treat "the cells pass" as evidence only once one of them executes the shipping path.

**STATE-BANNER, third sentence (09-03 ~13:20).** A truing PR's banner that names its OWN PR is structurally one commit behind its tip — the PR number exists only after the push — so write that line as "#N (this PR)" without a sha, and say it once rather than re-stamping. The STATE-LINE rule binds the truing's own new lines above all: a state line the PR itself authors (a Lanes or Next row) states step + ruling and POINTS at the banner, never carries a second copy — one truing shipped a lane as "DRAFT at step 2" in three re-authored lines beside a banner that said MERGED.

## FS-0 · The live-catalog verb census (裁-75) — size 0.3, no product code

**Why:** 裁-72 rests on `verb-coverage-census-2026-08-28.md`, pinned at frontier `0138` before the
port wave; the plan's own exit gate (`fe-train-plan-2026-08-30.md` §5.2 proof 1) is the instrument.
**Do:** a throwaway `postgres:17` rig → `node scripts/migrate.mjs` through `0155` → seed → read the
LIVE catalog (`pg_proc` + `has_function_privilege('clara_authenticated', …, 'EXECUTE')` + the
`_visible` views), never migration text. Direction 1: for every granted function/view, is there an
`apps/web` call site (`callDoor("<name>"`, `getRows("<relation>"`, or a wrapper in `apps/web/lib/**`
that names it) — classify UI-wired · deliberately non-UI (cite the ruling/runbook) · honest note ·
NO HOME. Direction 2: every name `apps/web` calls resolves. **Output:** a dated
docs/plan/active/verb-coverage-census-2026-09-XX.md (a new file) with the NO-HOME list and both counts, a
`NotBuiltNote` order per NO-HOME verb (or a ruling pointer), and an amendment note under 裁-72 in
the 08-30 ledger citing the measured residual. **Acceptance:** the denominator comes from the live
`pg_proc` read; every NO-HOME name re-checked by hand at its `apps/web` grep.

## FS-1 · #451 P4-2 — the scope spine, round 9 (resume, do not reset)

Worktree .claude/worktrees/p4-2-cx, branch web/p4-2-scope-spine, tip `3abb2b0f` + an
uncommitted three-file draft. **The bar (the reviewer's 16-probe table, restated):** H1–H14 — a
handler that mutates through a response ARGUMENT (`res.json(await mutateBooks())`), a name-trusted
`sendError` body, a computed `[op]` mutator, an early-return before the guard, a guard that reads a
projection of the scope instead of the scope, a try/catch that swallows the refusal, a redirect that
carries the prior client's state, a `(full)`-route escape, the runtime route handler bypass, a
missing `caller_context` re-read after `accept_invite`, a membership read from a cached object, a
`requireFirmScope()` that returns on `undefined`, a layout that renders children before the check
resolves, a test whose oracle is the implementation's own regex; N1–N4 — the negative controls
(no-membership · removed member · second-firm session · anonymous); C1–C4 — the positive controls
(owner · admin · bookkeeper · viewer). Each probe: RED-before captured, then green. The open
polarity question — the strict one-hop helper rule vs the real runtime `sendError` (which calls
`mapIntakeError`) — is settled toward **the strict rule** (a helper that can evaluate a denial-path
argument is a mutator). Full suite + lint + push; the same-reviewer re-verify.

## FS-2 · #461 P4-3 — the entry group, round 6 (merge-gating)

Worktree .claude/worktrees/p4-3-entry (if absent, `git worktree add … origin/web/p4-3-entry-group`),
tip `bebfb36e` (1402/1402). **NEW-A (HIGH):** `Referrer-Policy: no-referrer` on /auth/confirm
makes the confirmation form POST send `Origin: null`, so the same-origin wall 403s every real
browser. Fix `strict-origin`; **never accept `Origin: null`**. **Acceptance:** `pnpm --filter
@clara/web build` → `next start` → a real browser click on the confirmation page succeeds, with the
three instrument traps respected (a `fetch` from a test is not a browser; a `curl` with a forged
Origin is not the browser; the check runs against the BUILT app, not `next dev`). NEW-B pins: the
`Origin` allowlist is derived from `CLARA_PUBLIC_ORIGINS` (fail-closed when unset) and a cell pins
`Origin: null` → 403 with a positive control. Then rebase onto #451's tip. **This train creates the
e2e suite (裁-86):** apps/web/e2e/ with a Playwright walk signup → confirm → the holding page on the
built app; its run is the acceptance's evidence, not a substitute for the three traps.

## FS-3 · #455 P4-4 and #453 P4-5 — merge-forward and retarget

#455: CLEAR both legs at `1a131a5a`; round 8 = merge-forward onto #451's tip
(the branch's firm-scope sourceOracle.ts + the test-manifest conflict), the fixture LOW
(`2026-01-01T99:99:99Z` is not a timestamp — use a real future instant), import the shared
confirmed-user predicate instead of a local copy; retarget to `main` after #451 merges. #453: CLEAR
at `b6359309`; retarget after #451. Neither is the tier-3 path (裁-68: no operator queue for
self-serve); #453 is operator tooling and the same-day fallback if the checkout train slips.

**HARD PRECONDITION — on #455, and on ANY train that reaches the blind spot first (2026-08-31):**
the gate below binds #455 by name, but the blind spot belongs to a SHAPE, not a PR: **any train that
introduces a Server Action (`"use server"` export) or a layout-adjacent special file
(`template`/`default`/`error`/`global-error`/`loading`/`not-found`) must either land after the census
fix or carry it.** FS-4's checkout is the live example — a payment form is exactly the surface a lane
would reach for a Server Action to build, and it is running in parallel; its design order has been
told to design onto server-only ROUTE HANDLERS (which the census does classify) and to raise it as a
gate question rather than choose an action silently.

**The gap itself:** the firm-scope-surfaces census (apps/web/tests, arriving with #451) has a `LEAF`
regex that sees only `page|route` files, so a root template.tsx and a `"use server"` action both reach firm-scoped data, full suite green
(demonstrated by #451's reviewer, not argued). #455 is the train that adds mutating member surfaces,
so it must not merge over a census that cannot see them. Scope, and the trap in it: extend `LEAF` to
`default|template|not-found|error|global-error|loading`, register the legitimately-unscoped files,
and add the `"use server"` class over `app/**` + `lib/**` — **with a positive control**, because at
zero actions in the tree that census passes vacuously and would ship as a green that proves nothing.
Full statement in `PROGRESS.md` Known issues.

## FS-4 · The checkout / signup-gate train (裁-73 · 74 · 68 · 81 · 26 · 36 · 64①) — design gate FIRST

**This is the most dangerous door in a multi-tenant system** (R8, 2026-08-26: the self-serve
tenant-creation door takes its OWN design gate + security review; never fold it into UI work).
**Read FS-3's HARD PRECONDITION above before choosing a transport:** the scope-spine census is blind
to Server Actions, so this train designs onto server-only ROUTE HANDLERS — a payment form is exactly
where a lane would reach for a `"use server"` action, and that shape must not land before the census
fix does.
**Step 1 — the survey + design + gate record** (three new files, docs/plan/active/checkout-gate-survey.md ·
-design.md · -gate-record.md — the estate's own shape): measure `create_firm` (`0147:497`), `firm_admissions` (hash-only since
`0147`), `request_firm_registration`/`firm_registration_requests` (`0145:370, :911`),
`claim_identity` (`0141:250`), the P4-3 signup flow in #461, `billing-design.md` §3.11 + Annex C,
`billing-annexes.md` Annex C.2 (webhook → door) and D.2 (PR-3's objects). **The ruled shape to
design to:** `/signup` → `claim_identity` → `request_firm_registration` (pending) → a Stripe
Checkout Session in subscription mode at the zero-amount price (metadata: the registration id and
the caller's identity) → on `checkout.session.completed`, a server-only webhook route verifies the
signature with the raw body (`Webhook.constructEvent`; a failure is 400 and calls NO door), then
calls the one idempotent door `record_stripe_event(event_id, type, payload)` (append-only
`clara.stripe_events`); a separate audited applier marks the registration PAID; the user's
success page calls a server-only route that, as the caller, invokes a new governed door
`claim_paid_admission(registration_id, op_key)` — SECURITY DEFINER, refuses unless a paid,
unconsumed payment row exists for THIS caller's registration, mints exactly one
`firm_admissions` row and returns its plaintext once — and then `create_firm(name, token, op_key)`
in the same request → redirect to the firm home. **Also in this train:** the DPA e-sign at signup
(裁-68①, text from `docs/ops/legal/`), 裁-26's email-bound admission token, and 裁-36's rate wall
after its short design sitting (裁-64①: a server-only courier passes the proxy-observed address
into a door argument; the DB stays the wall) — write the sitting's two options into the design and
let the owner rule. The holding page (裁-74): resume-checkout + accept-invite reachable; no
reminder mail; nothing deleted. **Stripe objects (裁-81):** mount the official Stripe MCP in
~/.codex/config.toml with the TEST restricted key in that server's env; create Product/Price
from `billing_plans` rows (PR-1's placeholder rows with `amounts_ruled=false`, or a minimal
`billing_plans` seed if PR-1 is not built yet — say which), the webhook endpoint, Stripe Tax per
裁-54 — every object recorded in `stripe_object_map`; never hand-author a price.

**MANDATORY DESIGN INPUT — the confirmation login-CSRF hole (found 2026-08-31 by #461's Codex
law-28 security leg; mechanism verified by the orchestrator at the live bodies).** The confirmation
route's POST (auth/confirm) proves only that the click came from a Clara page
(`proveSameOrigin`), never that THIS browser
initiated the signup that `token_hash` belongs to. An attacker signs up with credentials they
control, sends their own legitimate confirmation link to a victim, and the victim's click consumes
the token and installs the ATTACKER's session in the victim's browser — the victim then types their
firm's details into `claim_identity` / `request_firm_registration` under the attacker's identity, and
the attacker signs in later with their known password. The same-origin wall cannot see this by
construction: the forged page IS Clara's page. **This design MUST answer it** — a browser-bound,
server-verified binding between signup initiation and confirmation (the natural home for **裁-26 /
裁-68③'s email-bound admission token**; 裁-68's tier-3 gate is ①DPA e-sign ②the rate wall ③the
email-bound token), never a widened Origin check. **Weigh Supabase's native PKCE confirmation
exchange first** (`code` + `exchangeCodeForSession`, whose `code_verifier` cookie IS a browser
binding by construction) against a hand-rolled nonce: this app currently uses the legacy
`token_hash` + `verifyOtp` style and never sets `flowType`, which is precisely why no binding
exists — a platform-precedented fix beats an invented one (found by #471's review). **Fenced meanwhile:** the fix was NOT bolted onto
#461 because R8 reserves this door for THIS gate; the exposure is zero while `apps/web` is
undeployed, and **"self-serve signup is unreachable in a deployed build until this train closes the
binding" is a hard FS-10 cutover criterion** (`PROGRESS.md` Known issues carries the row).

**Walls to prove
with RED-before cells:** signature failure → no door; replayed event → one row; a paid registration
of ANOTHER caller → refuse; a consumed admission → refuse; `Origin: null` → 403; the rate wall both
polarities; the DPA unsigned → no checkout; **a confirmation token minted by a DIFFERENT browser →
refuse (the login-CSRF binding above), with a positive control that the initiating browser succeeds.** **Beta scope:** checkout + admission + the holding page;
NOT invoicing (nothing invoices at RM0). **Review:** the security lens (§A step 4) is mandatory.
**裁-111 (2026-09-01): the cross-family Codex adversarial leg is SUSPENDED until beta live** —
the ONE fresh-context opus review is the complete gate for the sprint; law 28 resumes at beta
unless the owner rules otherwise. The reviewer brief carries two standing items: the
bidirectional seam↔door parameter diff in the PR BODY (裁-107/107b) and the OVERCLAIM lens —
does anything in this diff assert an absolute where the code delivers a conditional? (裁-112)
**E2E:** signup → checkout (Stripe TEST, a test
card) → the webhook → the firm born → the firm home, in a real browser. **Stripe objects (裁-87):**
the orchestrator creates them from the DB rows through the session's Stripe connector and records
the ids in `stripe_object_map`; the lane's code reads them, never authors them. Size ~0.4 BE +
~0.5 FE.

## FS-5 · The interview-runner port (裁-78) — size 0.7, hard cutover criterion

**Runtime surface (live, `packages/runtime/src/interviewRoutes.ts`):** `POST /api/interview/client/start`
(:260) · `POST /api/interview/answer` (:301) · `POST /api/interview/cancel` (:307) ·
`GET /api/interview/state` (:376); bookkeeper+ floor at the routes; Bearer = the session JWT.
`POST /api/interview/firm/start` is the firm-side interview — NOT this order. **The old client:**
`apps/dashboard/app/shared/interviewApi.ts` (`runtimeFetch` at :313/:322/:348/:486),
`apps/dashboard/app/onboarding/client/page.tsx`, `InterviewPanel.tsx`,
`apps/dashboard/app/onboarding/useInterviewRun.ts` (a
`GET /state` poller) — port the contract, not the code. **Transport:** the same-origin proxy
`apps/web/app/api/runtime/[...path]/route.ts` (already generic, allow-lists three headers, reads
`CLARA_RUNTIME_URL` at request time). **Shape (fa7b-onboarding-design.md §3.3, R7):** the interview
is an ESCALATED Clara thread, URL-addressable under the client workspace
(the existing full-screen route family /clients/[clientId]/clara/[threadId] — the interview
run rides it or a sibling `…/onboarding` route, URL-as-truth), collapsible to the rail, progress
line as the thread header, the park/answer protocol unchanged, **no optimistic UI** (an answer is
in the thread only after `GET /state` says so), the 409 on a second submitter rendered honestly.
The materials fork (§3.4) and the five playbooks are PR-c scope — NOT this order; `opening_position`
stays two-valued. **Entry:** the onboarding checklist card (T11, `OnboardingChecklistCard`) gains
the "start / continue the interview" control; `commit_client_onboarding` stays the human door it
is. **Acceptance:** a real run against the live runtime with a throwaway test client (ADR-0075):
start → answer every segment → cancel path → a second submitter's 409 → commit reachable — walked
in a real browser (the e2e leg, 裁-86) as well as in the unit harness; the routes suite; a11y rules +
keyboard walk on the thread; the cutover proof line "the interview
runner has an `apps/web` home" written into the P6-X order's acceptance.

## FS-6 · #462 / #463 and #454 (裁-79)

**#462** (worktree .claude/worktrees/coa-prb, round 2 uncommitted: the `ARRAY[NULL]` bricking
wall, section-only families human-opt-in, hash-source split, the named race refusal, five-ledger
counters, PR-a I-M8 scoped; focused 37/37): full suite on a rig + root lint + push + the N4-real
merge-prep note; then the fresh read-only review → fold → merge; the migration number is claimed at
merge. **In the same pass**, true the interview copy at `packages/runtime` interview questions
(the `coa_seed_decision` question) so it promises exactly what #462 delivers (a human applies the
template from the onboarding checklist). **#463** stays as built and reviews after #462.
**#454** (`chatTurn_v16`, merge-prep `c5e0fef7`, native r5 CLEAR at `443c386e`, CI green): one
fresh read-only review over the merge-prep tip (the transcription parity of the four wire shapes
against `apps/web/lib/parts/types.ts`, kinds AND fields), merge, then the Fly deploy ceremony
(`fly deploy` from the repo root; positive read of `chatTurn: chatTurn_v16` in the served bundle;
the freeze manifest `--lock-deployed`; `PROGRESS.md` posture line).

## FS-7 · Reports + close-prep chat tools (裁-77) — `chatTurn_v17` + F-A5b PR-3

**Rung 0 first:** which wake wrappers the `interactive`/`interactive_client` credentials may call
today — read `clara.wake_fn_allowlist` on a live-catalog rig. The report wrappers
(`wake_open_report_run(p_client, p_report_spec_version_id, p_books_snapshot_id, p_reporting_period_id, p_rationale, p_model, p_op_key)`,
`wake_assess_report_claim`, `wake_seal_report_dataset`, `_enqueue_render_job_core` via its
wrapper — `0114`…`0116`) are allowlisted to the interactive family (`0116:115`); the twelve `0138`
close wrappers (`wake_begin_close` · `wake_abandon_close` · `wake_open_fiscal_year` ·
`wake_list_fiscal_years` · `wake_get_close_plan` · `wake_get_close_readiness` ·
`wake_dry_run_close_readiness` · `wake_verify_close` · `wake_propose_close` ·
`wake_run_depreciation_catchup` · `wake_mint_month_snapshot` · `wake_snapshot_state`) were minted
for the `close_prep` wake kind — **if their allowlist rows do not admit the interactive kind, that
is a rows-only migration (INSERT rows, never a trigger recut — ADR-0076's law), with a census cell
both polarities.** **Runtime:** a NEW frozen closure `chatTurn_v17` beside byte-untouched v1…v16
(constraint 9; `.claude/rules/runtime-workflows.md`), built like `chatTurn.v15.tools.ts` extends
v14 by import: v17 = v16's set + the report tool set + the close tool set, `interactive` family
only, each tool's op_key deterministic per turn+segment+seq (the `bankPackReadSeq` precedent),
every DB call in named-argument notation, positive per-verb reply parsers, refusals rendered
verbatim. The human ISSUE stays human (`approve_report_for_issue`, the Reports tab). **PR-3 (F-A5b):**
the byte-burn render worker — placeholder → PDF end to end through the substitution seam
(`sandbox-export-design-part2.md` §3.6 / card-1 design), `packages/reporting-render`, the
render-job kind, the byte-hash receipt; the download door on the Reports tab. **Acceptance:** on a
rig, "open → assess → seal → render" driven from chat lands a `report_artifacts` row and the PDF
bytes download from the Reports tab; the close tools begin/verify/propose a close from chat with
receipts; every new tool has a refused-credential cell (an `autodraft`/`proactive` credential is
refused CLR03 at the DB). Sizes 0.4 + 0.2 + 0.6; each leg its own PR; the security-lens reviewer
on the allowlist migration.

## FS-8 · P6-T IA shell + the honest-note sweep (裁-80)

P6-T per [`fe-train-plan-2026-08-30-orders-p6.md`](fe-train-plan-2026-08-30-orders-p6.md) §P6-T,
**IA only**: the client Tax tab route + nav + ⌘K rows, the firm-level deadline feed shell, one
`NotBuiltNote` per panel naming verb + lane (F-T1 PR-2… · F-T2 rows · F-T3 PR-2…9), the tab's
shape stated as a proposal/receipt surface (裁-44) in the report. **The sweep:** derive every
`NotBuiltNote` from the live app tree (the `routes.test.ts` pattern), resolve each against
`PROGRESS.md`'s Backlog/Known-issues rows; any note whose lane merged is trued in the PR; any note
whose lane is paused must name a row. Size 0.3 + 0.3.

## FS-9 · The third conformance pass (裁-9) — P6's entry gate

Re-fetch github.com/BELCORT-SDN-BHD/clarabook-frontend at `main` (PR #1 merged `a7709883`; one
open PR #2 on the brand guideline) and read the DESCRIPTIVE resources — the prototype screens and
components under that repo's g6-high-fidelity/clarabook-prototype/ tree — as the parity reference for every built
surface; record deviations by ruling, never absorb them. Output: a new file docs/plan/active/clarabook-conformance-pass-3-2026-09-XX.md
(consumed / diverged-by-ruling / owed) and the P6-6 identity items confirmed (Ledger Fold ·
mascot · ClaraBook copy pass). Size 0.3.
**Note:** pre-run 2026-09-02 by the checkpoint scan; record at
`docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md`. **SIGNED OFF 2026-09-03** — FS-9 is
CLOSED as P6's entry gate. The verdict, the per-line table with its evidence, the re-fetch
discharge, and the four things the sign-off deliberately does NOT close all live in that record's
head banner and in its row in [`index.md`](index.md); they are never restated here, so a reader
acts on the record, not on a second copy of it.

## FS-10 · P6-X — the cutover (orders-p6 §P6-X, amended)

Everything in [`fe-train-plan-2026-08-30-orders-p6.md`](fe-train-plan-2026-08-30-orders-p6.md)
§P6-X stands, with these amendments: the scope note's "after ALL SEVEN P6-C trains" is **replaced
by 裁-75** (the measured residual + honest notes); **the interview runner has an `apps/web` home
(裁-78)** is a hard acceptance line; **self-serve signup must be unreachable in the deployed build
until FS-4 closes the confirmation login-CSRF binding** (FS-4's mandatory design input; a positive
read of the deployed route's behaviour, never an assumption) is a second hard acceptance line; the
exit-gate census is FS-0's output re-run at the tip.
**Workers deploy:** build on WSL/Linux with Node ≥ 22 (`pnpm --filter @clara/web cf:build`;
`wrangler` needs it — the root pin is Node 20), secrets via `wrangler secret put` (env-to-env),
`CLARA_RUNTIME_URL` + `CLARA_PUBLIC_ORIGINS` + the Supabase publishable key set, the Worker ≤ 10 MiB
compressed, a preview URL walked route by route BEFORE the DNS change, then the custom domain
`app.clarabook.com` moved from the Pages project to the Worker, **the Pages project's Git integration
disconnected FIRST** (measured 2026-08-31: the Pages project `clara` builds on every PR and every
push to `main`, so until it is disconnected every docs merge re-deploys the OLD dashboard), then the
project retired
(repoint first, prove, delete second). Ceremony-grade, from merged `main`, with an as-run in
`docs/plan/completed/`.
**Acceptance:** OPS.x (裁-121②): the Workers deploy of apps/web carries a parts union ⊇ the
serving runtime's emittable kinds, re-checked at every future `_vN` bump. BELCORT's `is_operator`
is set at the Wave-G reset as its own ceremony step (裁-121③), not at the post-beta G1 ceremony.

## FS-11 · The reduced Wave G (裁-83) → beta

From merged `main` after FS-10: the factory reset of the estate (`packages/db/README.md`'s reset
scoping; ADR-0075 — every firm/client is test data; the spike/workflow schemas untouched,
constraint 15) → apply the full unapplied span (`0154` through the frontier — **`0164` expected once the FS-4 chain lands**: `0161` #509 Q-D6 · `0162` #512 FS-7 e2 · `0163` #493 C-3 · `0164` #517 C-6; **count the migrations directory, not this line**)
(its pre-flight refuses on duplicates; the reset removes them, 裁-67)
→ the Supabase/Resend/Cloudflare items of `docs/ops/wave-g-setup-checklist.md` proven → the
sixteen-step walk on the desktop corpus with Stripe TEST mode (a non-zero test price + test cards
proving charge → webhook → firm), **driven end to end in a real browser (Playwright, 裁-86)** → the as-run (a new file docs/plan/completed/wave-g-reduced-asrun-2026-09-XX.md)
→ switch Stripe to LIVE + the RM0 price at the launch sitting → beta.

## FS-12 · Harness duties this sprint owes

- `PROGRESS.md` trued at every clock-out; the parked PRs' rows kept honest; `ADR-0077` signed by
  the owner and the digest re-trued; the 08-30 ledger's 裁-72 amended after FS-0; the
  `verb-coverage-census-2026-08-28.md` superseded by FS-0's file (index row: superseded).
- Root `README.md`, `apps/dashboard/README.md` (a SUPERSEDED banner), `apps/web/README.md` ("no
  signup route" → the ruled self-serve signup; 26 parts; P4/P6 state), `apps/web/AGENTS.md:3`,
  `packages/runtime/README.md`'s ledger line, `frozen-evaluators.json`'s four stale UNDEPLOYED
  notes (plus the twenty-four sibling notes in `frozen-workflows.json`),
  `.claude/skills/orchestrator-fable/SKILL.md`'s lane text and the `/grill-me` name — the
  "PR-2" truings the 2026-08-31 docs-only PR could not touch (they flip the CI classifier); one
  small PR under the full ladder.
