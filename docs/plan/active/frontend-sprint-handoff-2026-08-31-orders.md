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
replaces them. The day's rulings are in `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md`
(裁-132…141; 裁-129…131 are in the `-09-02` file it continues).*

**Native lanes only (裁-133, owner, 15:50).** Until beta live launch there is no Codex lane of any
kind — builds included. Every lane is native: sonnet-5 xhigh for bounded, mechanical, objectively
testable work; opus-5 xhigh where judgement, security or ambiguity dominates, and for every review.
The Codex REVIEW leg was already suspended by 裁-111; both resume at beta live unless the owner
rules otherwise. Fable stays the orchestrator, and the 3–4 heavy-lane host cap still binds — native
lanes run the same suites.

**PROCESS LAW (14:53, re-cut 21:40 after a second breach).** NEVER kill processes by NAME
(`Get-Process node | Stop-Process`, `taskkill /IM node.exe`, `pkill node`) and never by a
CommandLine SUBSTRING. The host runs other lanes, reviewers and long-lived tooling as node
processes; a name-kill took down two sibling lanes mid-round, and a `*test-concurrency*` filter
killed two more root trees because `--test-concurrency=1` is in the SHARED db test script and
therefore identifies the ESTATE's suites, not one lane's. The only lawful kill is the PID you
captured when you spawned the process (keep the handle: `$proc.Id` / `$!`), then its tree by THAT
pid (`taskkill /PID <pid> /T`). A dev server or Playwright you started is yours by PID; nothing
else on this host is.

**FOLD-ROUND DELIVERABLE (16:20).** Every fold round ships a MUTANT PANEL as a stated deliverable:
for each new or changed cell, the one-line mutant of the shipped body that must red it (run it,
quote the red), plus a MUST-NOT-RED control (the unmutated body, full focused count) and an
md5/byte check that every mutated file is restored. A cell whose own named defect leaves it green
is not a cell — rewrite it before pushing. Twice in one day a fold shipped exactly that.

**MUTANT-PANEL RESTORE LAW (19:40).** A panel that restores mutated files from git
(`git restore` / `git checkout --`) is safe only on a COMMITTED tree. During a fold round —
uncommitted edits present — the panel captures each file's buffer before mutating and restores THAT
buffer, then compares `git status --short` before and after (never against empty) and md5s every
touched file against its pre-mutation hash. A git-restoring panel silently reverted two uncommitted
fold edits; a panel that destroys the round it is verifying is worse than no panel.

**PRINT-THE-THING LAW (20:30, widened 00:35).** An instrument that returns a boolean over something
a human could read must PRINT the thing instead: a citation verifier prints the target LINE of
every `file:line` it checks (an in-range check is not a resolves-to-the-right-thing check); a count
control prints the census it counted; a mutant panel prints the failing cell names, not "red". And
printing is not enough on its own — print a value that LOOKS like the thing (a 32-hex check on a
digest probe): one panel printed the column header `md5` as its "value" for a whole round, because
its psql wrapper dropped `-t -A`, and still passed.

**MERGE-FORWARD LAW (17:40, items 6–8 added the same night).** A git auto-merge is not a
resolution. After ANY merge of origin/main into a branch: (1) diff shared message catalogues
(`apps/web/messages/en.json`) at the VALUE level for keys BOTH sides touched — and with a RAW-TEXT
duplicate-sibling-key scan too, because `JSON.parse` keeps the last of two siblings and a
value-level diff can never see one; (2) grep every auto-merged TSX for duplicate JSX attributes and
every touched file for duplicate declarations (`const x` twice is a hard SyntaxError), with a
scanner that carries its own positive control; (3) when both sides retired the same pin, take one
shape wholesale after a line-set diff, never a textual interleave; (4) re-run a prefix-dispatching
e2e harness in BOTH orders when two PRs add handlers for overlapping prefixes; (5) stage first —
root lint mid-merge is meaningless (an unmerged path sits three times in the index and the links
checker misresolves basenames); (6) run the three a11y gates and the contrast gate on the MERGED
tree, not only the browser leg (a live region nested inside another existed in neither branch
alone); (7) re-read every gate whose PREMISE names a set the other side widened ("messages is
empty" stopped meaning "the conversation is empty" once a live clarify card became visible content
outside `messages`); (8) diff the e2e harness's composed ENVIRONMENT between both parents and the
merge (every `env:` / `process.env` assignment in the walk scripts and `apps/web/playwright.config.ts`) and
compose on ONE origin per variable — main and a branch each set `CLARA_RUNTIME_URL` in different
places, git merged both without a marker, and every confirmation answered "unavailable" until the
browser leg caught it. Conflict markers mark textual overlap, never semantic collision.

**MERGED-TREE LAW (22:00).** A lane that applies a sibling PR's migration as SQL but does not carry
that PR's TEST FILES has not tested the merged tree — it has tested its own branch against a
schema. So: (a) a lane whose rig stands on a sibling's unmerged migration says in its report WHICH
of that sibling's cells its rig lacked; (b) the reviewer re-runs the estate suite on the MERGED tree
(both PRs' test files) on a fresh CONTAINER — a second database on an existing rig is not clean,
roles are cluster-level and `0154`'s role-count tail refuses; (c) **"introduces zero new failures"
is a merged-tree claim and is only made from a merged-tree run.**

**GATE-SHAPE LAW (22:10).** "Green on my rig" proves nothing until the rig has the GATE'S shape.
The weekly-sweep job runs ten drill steps against ONE `postgres:17` service, each in its own
database, none dropped; roles are cluster-wide and `DROP ROLE` consults `pg_shdepend` across every
database — so every later step inherits every earlier step's roles and objects. A fix to a CI-only
drill is verified by reproducing the job's step SEQUENCE on one container (the preceding steps' end
state included) and then the fixed step, with a negative control (the sequence without the fix) that
must still red. Read `.github/actions/*/action.yml` for the shape before the first measurement — a
fix that was green twice on a one-database cluster reded in 652 ms on the job's.

**ARMED-PR LAW (23:35).** Auto-merge is the grant for the REVIEWED tip only. A push onto an armed
PR — a fix, a merge-forward with any resolution, anything but a pure fast-forward of main with
measured zero overlap — would merge on green with no eyes on it. So: (a) the lane's report says in
its FIRST line "pushed onto an ARMED PR: `<sha>`"; (b) the lead disarms before CI greens and
dispatches a re-verify of the delta, to the same reviewer where one exists; (c) a lane never
re-arms. The one exception (a pure fast-forward of main with measured zero overlap) is still named
in the report.

**Two standing riders, from the same day.** *Re-read every touched COMMENT against the code before
you push* — three rounds on one train shipped a comment describing the resolution the round had just
replaced. *And a merged condition needs a mutant per arm* — when two arms merge into one predicate,
a panel anchored on the old text reports ANCHOR-MISSING, which counts as "did not red", never as a
pass.

**MUTANT-PANEL LAW, second clause (09-03 ~00:30).** A mutant's RED is read for its REASON, never its colour. #519's M27 moved a door's floor inside a migration body and reded — for an unterminated dollar-quote, because `String.replace` with a STRING replacement interprets `$` patterns and turned the `$$` body opener into `$`. A non-discriminating mutant wearing a discriminating result is the expensive direction. So: any replacement text containing `$` goes through a replacement FUNCTION; every panel row prints the failing cell's NAME and its assertion message; and a RED whose message names something other than the property under test is NOT a pass. A guard that is its own instrument — a drift guard, a census — carries a positive control before it is trusted.

**FROZEN-TREE clause (09-03 ~00:40).** A suite running on a worktree OWNS that tree: never edit it mid-run (Q-D6's first branch run was destroyed by exactly that). But a lane does not wait hours for a control run to free its tree either — fold in a SECOND worktree of the same branch, junctioned the same way, or run the control side on a throwaway worktree, so measuring and editing proceed in parallel. A lane that is serialising behind its own pair says so in a report AT THE TIME, not when asked three hours later.

**PRINT-THE-THING, second clause (09-03 ~01:10).** On Node 20.19 a cell cancelled by its parent — a hung promise that never settles takes every sibling with it — prints `not ok` but is NOT counted in `# fail`: a two-cell probe printed `# tests 2 / # pass 0 / # fail 0` and EXIT 1. CI is fail-closed on the exit code, so a lane script that reads only the `#` totals calls that suite GREEN. The honest reads, always together: the exit code, `# pass` against `# tests`, AND the `^not ok` lines. And a never-settling stub must honour its `signal` (a real fetch rejects on abort) and carry a fuse with a DIFFERENT error name, so a timeout mutant reds on the identity assertion instead of hanging the file.

**ABSENCE-CENSUS clause (09-03 ~01:15).** An absence census scans the tree it guards, so a sentence DESCRIBING the census must not live inside that tree with the needle spelled out — #512 named the SDK's signed-URL minting calls in a comment under the scanned path, and its own cell reported the comment. The literal identifiers belong ONLY in the instrument's needle list; prose elsewhere names the class in words. Scanning comments is the RIGHT design (a comment is where the next developer copies from) — say so beside the cell, and give every absence census a positive control (a planted needle in a scratch file under the scanned path must red it) plus its stated scope (the globs it walks).

**BACKGROUND-VERIFIER clause (09-03 ~01:34).** A backgrounded verification run is UNPIPED and teed to a file — a `grep` in the pipeline holds every line until the process exits, so "0 bytes" reads identically to "still running" — and a run whose webServer is a CHILD process is confirmed DEAD before the next attempt: a leaked `next start` on the lane's port makes Playwright fail fast with "port already used", which looks nothing like a test failure and hides behind a buffered pipe (#519's browser leg "ran" three times and never ran once). Liveness is read with `Get-Process`, never `tasklist` through Git Bash, which returns nothing on this host; zero browser processes means a Playwright run is FINISHED or DEAD, never "in flight". A leaked child is killed by PID after an OWNERSHIP check — the PID from `Get-NetTCPConnection` on YOUR port, its CommandLine from `Win32_Process` matching YOUR worktree path AND your port, then `taskkill /PID <pid> /T`. Never a name, never a substring.

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

**TWO-CLOCK DATE clause (09-03 ~01:15).** Never assert equality between a date derived from one clock (`current_date`, `now()::date`, JS `new Date()`) and a stored timestamp cast to a date under another: hosted runs sit in UTC while the rig or session may sit in MYT, and between 16:00 and 24:00 UTC the two days differ — every Malaysian evening. Derive the expected date from the SAME source and timezone the stored value is cast in (read `now()` in the same statement; cast both `at time zone 'UTC'`); never widen the assertion to "either day". Until the fix lands, an evening R9.E2 red is RE-RUN after 00:00 UTC, never adopted.

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
`docs/plan/active/clarabook-conformance-pass-3-2026-09-02.md`.

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
