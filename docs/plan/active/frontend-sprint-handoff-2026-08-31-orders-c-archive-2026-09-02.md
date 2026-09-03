# §C archive — the lane laws minted 2026-09-02

*Moved verbatim out of `frontend-sprint-handoff-2026-08-31-orders.md` §C on **2026-09-03**, when
that file reached its 500-line ceiling and the afternoon's new clauses had nowhere to land. **These
laws BIND exactly as they did in §C**: a lane that inherits the orders inherits this file with them,
and §C carries a pointer paragraph where they stood. Only the physical home moved — nothing below
was re-worded, re-ordered or re-dated, and the block is byte-identical to the source (md5
`f183c4b7bb9095fb26f5ac10727351ad`, 6,733 bytes, proven on both sides of the move). Per the plan
index's path-stability convention this path is now stable and is cited by that name.*

*The 2026-09-03 clauses, and every clause minted after them, stay in §C itself. The day's rulings
are in `docs/plan/active/mohe-grill-rulings-2026-09-02-pm.md` (裁-132…145).*

**PROCESS LAW (14:53, re-cut 21:40 after a second breach).** NEVER kill processes by NAME
(`Get-Process node | Stop-Process`, `taskkill /IM node.exe`, `pkill node`) and never by a
CommandLine SUBSTRING. The host runs other lanes, reviewers and long-lived tooling as node
processes; a name-kill took down two sibling lanes mid-round, and a `*test-concurrency*` filter
killed two more root trees because `--test-concurrency=1` is in the SHARED db test script and
therefore identifies the ESTATE's suites, not one lane's. The only lawful kill is the PID you
captured when you spawned the process (keep the handle: `$proc.Id` / `$!`), then its tree by THAT
pid (`taskkill /PID <pid> /T`). A dev server or Playwright you started is yours by PID; nothing
else on this host is.

**FOLD-ROUND DELIVERABLE (16:20).** Every fold round ships a MUTANT PANEL as a stated deliverable: for each new or changed cell, the one-line mutant of the shipped body that must red it (run it, quote the red), plus a MUST-NOT-RED control (the unmutated body, full focused count) and an md5/byte check that every mutated file is restored. A cell whose own named defect leaves it green is not a cell — rewrite it before pushing. Twice in one day a fold shipped exactly that.

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

**Two standing riders, from the same day.** *Re-read every touched COMMENT against the code before you push* — three rounds on one train shipped a comment describing the resolution the round had just replaced. *And a merged condition needs a mutant per arm* — when two arms merge into one predicate, a panel anchored on the old text reports ANCHOR-MISSING, which counts as "did not red", never as a pass.
