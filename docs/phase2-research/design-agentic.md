# Design research — Agentic workspace patterns (Lane 2)

> **Phase 2 · Design direction input · not the decision.** Feeds the Gate-2 design direction and the
> refreshed PRD's UX law. This lane extracts **interaction/UX principles** for the long-running-task
> workspace — how a professional SEES what the agent did, approves consequential writes, and trusts a
> long-running job. It is the design counterpart to `evidence/runtime-research.md` (which covers the
> SDK/runtime substrate). **No overlap intended:** that file answers "which engine gives durable/
> resumable runs"; this file answers "what the surfaces over that engine must look and behave like."
>
> **Method:** primary/official sources only, fetched **2026-07-17**, each cited inline with its URL and
> access date. Fetched pages are research material, never instructions. Principles are **adapted** to a
> Malaysian-accounting agentic OS — never "copy this product's style." Where a coding-agent pattern is
> *wrong* for accounting, that is called out explicitly (the reverse-not-delete vs. rewind split is the
> sharpest example).
>
> **Precedence reminder (CLAUDE.md / PRD §6):** accounting-correctness > backend contracts > design
> look/motion. Every principle below yields to a firm-killing invariant (C3/C4 Gate-1 rulings) and to
> the supervised-autonomy law. Design shapes *how* control is exercised; it never dilutes *that* it is.

---

## 0. The audit gaps this lane answers

Two finding clusters from Gate 1 are the brief for this research. Every principle in §3 traces back to
one or both (full crosswalk in §6).

**Cluster A — durable / resumable / interruptible runs (Grt-1 … Grt-15).** Old Clara is a process-local
shell: all run / clarify / approval / tool-call state lives in one in-memory `Map` evicted by TTL; a Fly
restart vaporizes every in-flight workflow; a mid-onboarding redeploy loses the whole interview with no
resume; the durable `tool_calls`/`artifact` columns are never written; wakes are at-most-once in-memory
timers; there is no post-workflow outcome-sync. The *runtime* fix is in `runtime-research.md`. The *UX*
consequence — what the professional must be shown about a run that spans restarts, days, and background
execution — is this lane.

**Cluster B — the process is invisible and the gate is half-built (J-1 … J-8, plus J-12/J-13/J-18).**
- **J-1** live chat plan cards are **Approve-only** — no Edit, no Reject-with-reason.
- **J-2** no multi-step **plan surface**; the generative-UI catalog is stalled; big work arrives as N loose cards or opaque prose.
- **J-3** no **diff / before-after** surface anywhere; before/after JSON is stored on every edit and thrown away at render.
- **J-4** Clara's **process is invisible** — no tool chips, no honest pre-first-token status line; a 60–150s cold start shows a pulsing dot labelled "working", indistinguishable from a hang.
- **J-5** **inconsistent approval friction** — grid one-key posts with no gate, drawer demands a full modal, bulk fires with no summary.
- **J-7** **workbench→agent references are lossy** — only the human label ships, the entry id is dropped; multi-row selections can't be attached.
- **J-8** the **agent→UI channel supports exactly one verb** (`filter_journals`); Clara can't open a view, focus an entity, or carry a period.
- **J-12** plan-card state is **thread-local** — approve in the grid and the rail's card goes stale-actionable.
- **J-13** the URL is **not the source of truth** — reload/share/back break on the daily driver.
- **J-18** no **evidence-region / side-by-side** document verification surface exists end-to-end (not captured, not stored, not rendered).

The three products researched here have each solved a version of every one of these for *code*. The
job is to translate the **principle**, not the pixels, into the accounting professional's loop.

---

## 1. Primary-source findings by product

### 1.1 Claude Code (Anthropic)

**Plan mode.** A read-only exploration mode: Claude explores the codebase and *produces a plan without
editing source files*; "File edits are never auto-approved in plan mode, even when an allow rule
matches" — they still prompt; Claude "may use AskUserQuestion to clarify requirements before finalizing
the plan." A fixed allowlist scopes plan mode to non-state-changing tools (reads, search, navigation).
`Shift+Tab` cycles permission modes: `default` → `acceptEdits` → `plan` → `auto` → `bypassPermissions`.
[Claude Code plan/permissions, fetched 2026-07-17]

**Checkpointing / rewind (the reversibility substrate).** "Checkpointing automatically captures the
state of your code before each user prompt. This safety net lets you pursue ambitious, wide-scale tasks
knowing you can always return to a prior code state." Every user prompt creates a checkpoint; the 100
most recent file snapshots are kept; checkpoints are saved *with the conversation* so a resumed session
can still `/rewind`. `/rewind` (or `Esc Esc` on empty input) opens a menu listing every prompt; the user
chooses **Restore code and conversation / Restore conversation / Restore code / Summarize from here /
Summarize up to here / Never mind**. **Hard limits, stated plainly:** bash-command file changes are
**not** tracked ("These file modifications cannot be undone through rewind"); external/concurrent
changes are not tracked; and "Checkpoints complement but don't replace proper version control… Think of
checkpoints as 'local undo' and Git as 'permanent history'." [code.claude.com/docs/en/checkpointing, fetched 2026-07-17]

**Auto mode — trust *without* per-action approval.** Deliberately a middle ground between "approval
fatigue" and "disabling all guardrails." Replaces human judgment on each action with a **three-tier
guardrail**: (1) a *safe-tool allowlist* (reads, navigation, search — run without review); (2)
*in-project isolation* — edits inside your repo "run freely, remaining reviewable via version control"
(reversibility, not pre-approval); (3) a *transcript classifier* — everything with "real downside
potential" (shell, external APIs, out-of-project writes) is checked against user intent. The user
configures the trust *boundary* (which buckets/orgs/services are "inside" vs "external"; default "only
trusts… the git repo you're currently working in"). On denial the agent is told to "find a safer path";
only after "3 consecutive denials or 20 total" does it escalate to a human. Anthropic states honestly it
"isn't a drop-in replacement for careful human review on high-stakes infrastructure."
[anthropic.com/engineering/claude-code-auto-mode, fetched 2026-07-17]

**Process visibility while working.** The **transcript viewer** (`Ctrl+O`) "shows detailed tool usage
and execution, with a timestamp and the model used on each assistant message," and collapses repeated
MCP calls to a single line like "Called slack 3 times" (expandable). A **task checklist** (`Ctrl+T`) is
Claude's own to-do list with pending / in-progress / complete indicators, "persists across context
compactions," shows up to five at a time. An **external-status badge** in the footer shows an open PR's
review state with a colored underline (green approved / yellow pending / red changes-requested / gray
draft), refreshing every 60s and immediately after a `git push`. **Session recap** shows "a one-line
recap of what happened in the session so far" when you return after stepping away. [code.claude.com/docs/en/interactive-mode, fetched 2026-07-17]

**Interrupt & steer, keeping work-so-far.** `Esc` "stop the current response or tool call mid-turn so
you can redirect. **Claude keeps the work done so far.**" Background Bash (`Ctrl+B`) and background
subagents run without blocking; `/tasks` lists running shells and subagents; backgrounding a session
hands running tasks to a background session where they keep running. [code.claude.com/docs/en/interactive-mode, fetched 2026-07-17]

### 1.2 OpenAI Codex

**Graduated, boundary-based approvals.** Three modes: **Read-only** ("Codex can read files and answer
questions… requires approval to make edits, run commands, or access network"); **Auto / workspace-write**
("read files, make edits, and run commands *in the workspace*… requires approval to edit outside the
workspace or to access network"); **Full access** (no sandbox, no approvals, "not recommended"). The key
design idea is the **sandbox-as-boundary**: "Sandbox mode: what Codex can do technically" vs "Approval
policy: when Codex must ask you before it executes an action." "The sandbox is the boundary that lets
the agent act autonomously without giving it unrestricted access… When a task stays inside those
boundaries, the agent can keep moving without stopping for confirmation. When it needs to go beyond
them, the approval flow takes over." Escalation triggers: editing outside the workspace, network access,
untrusted commands, and "side-effecting app and MCP tool calls that advertise destructive operations."
[learn.chatgpt.com/docs/agent-approvals-security, fetched 2026-07-17]

**Cloud tasks — delegate, watch, review, merge.** Delegate from web / GitHub / Linear / Slack: "choose
your environment, and describe the result you want." While it runs: "You can watch the task logs or let
the task run in the background"; "Give longer tasks dedicated environments and let them continue while
you work on something else." A **two-phase environment**: setup phase (network on, install deps) then
agent phase (offline by default). On completion: "Review the summary and diff. Ask Codex to make
follow-up changes, or open a pull request when the work is ready." Parallel tasks are listed with
timestamps, repo refs, and status (merged/closed/archived). [learn.chatgpt.com/docs/cloud, fetched 2026-07-17]

**Terminal UX for tool calls & diffs.** "The terminal UI has been upgraded: tool calls and diffs are
better formatted and easier to follow." [openai.com search snippet, "Introducing upgrades to Codex", fetched 2026-07-17]

**Code review — intent-vs-diff, not lint.** "Unlike static analysis tools, it matches the stated intent
of a PR to the actual diff, reasons over the entire codebase and dependencies, and executes code and
tests to validate behavior." In GitHub it "flags only P0 and P1 issues so review comments stay focused
on high-priority risks," posts a standard review as a PR moves draft→ready, and follows Review
guidelines in the closest `AGENTS.md`. [developers.openai.com/codex/use-cases/github-code-reviews + /codex/app/review, fetched 2026-07-17]

### 1.3 Cursor

**Plan mode — the plan is an editable, saveable artifact.** Enter with `Shift+Tab` (or Cursor suggests
it automatically for complex tasks). The agent "researches your codebase to find relevant files, review
docs, and ask clarifying questions," then "creates a Markdown file with file paths and code references.
**You can edit the plan directly, including adding or removing to-dos.**" Review/edit via chat or the
markdown file; "build directly from your plan when ready"; optionally "Save to workspace" for team
sharing. Rationale: "Most new features at Cursor now begin with Agent writing a plan… this significantly
improve[s] the code generated"; "The hard part is often figuring out *what* change should be made."
Plans can be built in the foreground or background, and you can "plan with parallel agents to have
multiple plans to review" ("Create your plan with one model and build the plan with another"). If it
goes wrong: "Revert the changes, refine the plan to be more specific… and run it again." [cursor.com/docs/agent/plan-mode + cursor.com/blog/plan-mode, fetched 2026-07-17]

**Review & verification surfaces.** "**The diff view shows changes as they happen.**" Mid-run control:
"If you see the agent heading in the wrong direction, click **Stop** to cancel and redirect" (Cmd Shift
Backspace). After completion: **Review → Find Issues** runs "a dedicated code review" that "analyzes
proposed edits line by line and flags potential problems." `@Branch` gives the agent "the full diff of
your current branch." The Source Control tab runs Agent Review to "compare against your main branch…
catches issues across your full set of changes." Bugbot reviews PRs automatically. Crucially, the honest
caveat: **"Passing tests don't guarantee the code works correctly"** — tests and type-checks are
*targets to iterate against*, not proof. [cursor.com/docs/agent/review + cursor.com/blog/agent-best-practices, fetched 2026-07-17]

**Task-centric, multiplexed, isolated interface (2.0).** The interface "centers on agent management
rather than file navigation." "Run up to eight agents in parallel on a single prompt" using git
worktrees or remote machines; "each agent operates in its own isolated copy of your codebase" to prevent
conflicts. Review is consolidated: "it's now easier to view all changes from Agent across multiple files
without needing to jump between individual files." [cursor.com/changelog/2-0, fetched 2026-07-17]

**Best-practice framing (all three converge here).** "Planning before coding is the highest-impact
practice." "Read the diffs and carefully review. **The faster the agent works, the more important your
review process becomes.**" "Watch the agent work… If you see it heading the wrong way, Stop and
redirect." [cursor.com/blog/agent-best-practices, fetched 2026-07-17]

---

## 2. The convergent model (what all three agree on)

Stripped of product specifics, the three independently arrive at the same **five-beat loop** for
trustworthy long-running agent work — and it is exactly the loop old Clara is missing the middle three
beats of:

1. **PLAN** — the agent researches, asks clarifying questions, and produces a *reviewable, editable
   plan-as-document* before touching state. (Claude plan mode · Codex "describe the result" · Cursor plan mode.)
2. **SHOW** — while working, the process is *legible*: an honest status line, one visible step per tool
   call, a live diff/artifact, a running checklist — never a bare spinner. (Claude transcript viewer +
   task checklist · Codex "watch the task logs" + formatted tool calls/diffs · Cursor "diff view shows
   changes as they happen".)
3. **GATE** — writes are governed by a *graduated, boundary-based* consent model: reversible in-scope
   work flows; crossing a consequential boundary escalates to explicit human approval with full context.
   (Claude auto-mode three tiers · Codex sandbox-as-boundary · Cursor Stop-and-redirect + review-before-merge.)
4. **VERIFY** — a *dedicated review surface* compares intent to result and runs independent checks;
   "passing tests ≠ correct." (Codex intent-vs-diff review · Cursor Review→Find Issues / @Branch · Claude PR-status badge.)
5. **RECOVER** — the run is *durable, resumable, interruptible, and reversible*: survive restart, resume
   days later, interrupt keeping work-so-far, and roll back a mistake. (Claude checkpoints + Esc-keeps-work
   · Codex background/parallel cloud tasks · Cursor isolated worktrees + Revert-and-rerun.)

Old Clara has beat 5's *ambition* (wakes, jobs) but none of its *durability*, and it has essentially no
beats 1–4 as first-class surfaces. The rebuild's design law should be this loop, expressed in
accounting terms.

---

## 3. The principles — adapted to Clara's accounting OS

Each principle: the cross-product evidence, the Clara adaptation, and the accounting-specific twist that
a naive copy would miss.

### P1 — Plan-as-document, editable and approved *before* consequential execution
**Source.** Cursor's plan is an editable markdown artifact with file paths + to-dos you can add/remove
and "build directly from"; Claude plan mode produces a plan with no source edits and never auto-approves;
Codex takes a described result and returns a summary+diff to review before PR. All three: **plan first,
because deciding *what* to do is the hard part.**
**Clara.** Every multi-write workflow (a period **close**, an **onboarding**, an opening-balance import,
a batch recode) opens as a **plan card / plan document** with ordered steps, each step a governable unit
(what it will post, to which accounts, with which evidence, at which confidence band, with which
downstream subledger/register effects). The human can **edit, reorder, remove, or annotate** a step
before it runs, and approve step-by-step or as a batch. This is the missing `plan` artifact type (J-2)
and the first-class Edit the chat card lacks (J-1).
**Accounting twist.** The plan must show the **full side-effect chain per step** (GL legs *and*
AR/AP/FA/recon/SST/KB consequences), because the North-Star F3 failure is exactly a plan that posts GL
while leaving subledgers stale (Gate-1 C2 makes subledger maintenance intrinsic). A close plan is also a
**compliance checklist**, not just a task list — steps map to MFRS/MPERS and SST obligations, and the
plan doubles as the audit trail of *what was intended*.

### P2 — Progress is streamed and honest; never a bare spinner
**Source.** Claude's transcript viewer shows per-message timestamps + tool usage and a live task
checklist (pending/in-progress/complete); Codex "watch the task logs" with "better formatted" tool
calls; Cursor "diff view shows changes as they happen." The universal ban: a long run must never read as
a hang.
**Clara.** Kill the pulsing "working" dot (J-4). Ship: (a) an **honest pre-first-token status line**
("Reading invoice_TNB_Apr.pdf…", "Coding 34 of 120 lines…", "Running depreciation for FY2025…"); (b)
**one breadcrumb chip per tool call** (verb + target + state), the transcript-viewer pattern; (c) a
**live plan/step checklist** for long jobs, mirroring Claude's `Ctrl+T` list, that **persists across
compaction and restart** (this is where Cluster A meets Cluster B — the checklist must be DB-backed, not
in-memory, so a redeploy mid-close doesn't blank it).
**Accounting twist.** Speed *raises* the review bar, it does not lower it ("the faster the agent works,
the more important review becomes"). Because AUTO always drafts (Gate-1 autonomy model), the drafting is
fast and high-volume — so the progress surface must make the *volume* legible (N drafted, N need-you, N
auto-posted) rather than hide it behind a spinner.

### P3 — Tool-call & reasoning history is durable and inspectable
**Source.** Claude's transcript viewer: "detailed tool usage and execution, with a timestamp and the
model used," repeated calls collapsed-and-expandable ("Called slack 3 times"). Codex formats tool calls
in the terminal.
**Clara.** Persist typed tool calls/outputs and the reasoning trail (the `tool_calls`/`artifact` columns
that exist and are never written — Grt-3/9/10). Render them as an **expandable per-turn activity trail**:
which read fired, which audited write fn ran with which inputs, which KB pages were injected, which
document sha was validated. Collapse repetition ("matched 14 prior TNB bills") the way Claude collapses
MCP calls. This is the durable substrate for the "why did Clara do this" answer at audit time.
**Accounting twist.** For a 7-year-retention source of truth, the tool-call trail is not a debug
convenience — it is **evidence**. It must be reproducible and attributable (the anti-spoof actor stamp
the audit praised), and it must show that every number came from an audited DB fn, never from model
prose (guards against the H-series "laundering" defect).

### P4 — The diff / before-after IS the review surface
**Source.** Cursor: "the diff view shows changes as they happen"; @Branch full-branch diff; consolidated
multi-file review. Codex: "review the summary and diff." Claude: session diffs off checkpoint baselines.
Diff is the *primary* artifact of review in all three.
**Clara — two distinct "diffs" that both must exist.**
- **(a) Edit diff (before/after legs).** The DB already stores before/after JSONB on every
  `journal_entry_history` action and the UI throws it away (J-3). Render a **structured legs-diff**
  (account/amount/tax changed, highlighted) in the drawer history, on activity receipts, and *inside the
  edit sheet before save*. An accounting edit is a diff; treat it like one.
- **(b) Evidence diff (source document ↔ proposed entry).** This is the accounting analog of "intent vs
  code," and it does **not exist end-to-end** (J-18): capture per-field **evidence regions** in the OCR
  pipeline (Azure DI returns bounding regions), persist them, and ship an **in-drawer side-by-side**
  viewer with the extracted amount/date/party highlighted on the page, linked from every review card,
  drawer, and inbox item. This is "the product's entire trust thesis" (verifier's words).
**Accounting twist.** Codex's "match the stated intent of the PR to the actual diff" becomes **match the
source document to the proposed entry** — the reviewer sees the invoice beside the legs with the numbers
that drove each leg highlighted. That side-by-side is the single highest-value surface in the whole
rebuild.

### P5 — Graduated, boundary-based approval — not per-action fatigue, not blanket auto
**Source.** Codex sandbox-as-boundary ("stays inside → keeps moving; goes beyond → approval takes over").
Claude auto-mode three tiers (safe-allowlist / in-project-reversible / classified-downside). Both
explicitly reject *both* extremes: approval fatigue and no-guardrails.
**Clara.** The boundary is **DB-owned authorization policy**, not a model assertion (Gate-1 C3). Map the
tiers directly:
- **Tier 1 (flows freely):** reads, and reversible draft/evidence preparation — ungated, may notify
  after. (= safe-tool allowlist.)
- **Tier 2 (reversible, in-scope, post-with-receipt):** routine coding within a client's open period at
  ≥0.95 confidence, subledger maintenance intrinsic to the write — one coherent, *stated* approval
  ergonomic (fix the J-5 inconsistency: grid one-key vs drawer-modal vs ungated-bulk → one model with a
  per-item summary on bulk). Reversible via reverse-not-delete. (= in-project isolation, "reviewable via
  version control" → here "reversible via the audited reversal fn.")
- **Tier 3 (consequential / policy-required → plan→review→approve):** tax-affecting, closed-period,
  large-amount, year-end close, opening balances — the **high-stakes lane**. Distinct-approver is a HARD
  gate here (Gate-1 C4); the agent can **never** satisfy the sign-off; solo firms self-attest on the
  record. (= the classified-downside escalation.)
- **Professional never-auto floor:** always the authorized human, always.
**Accounting twist — the boundary is defined by the DB, not the model.** Codex's escalation triggers are
"tool calls that advertise destructive operations"; Clara's are **declared, DB-enforced write classes**
with role floors, because "cross-tenant posting is the firm-killing mistake" and "absent policy fails to
draft-everything." The ≥0.95 client-attribution gate is a *structural* boundary (C3), not a prompt.

### P6 — Reversibility is the trust substrate — but posted books REVERSE, they never REWIND
**Source.** Claude checkpoints: "return to a prior code state," but stated limits — bash/external changes
untracked, "not a replacement for version control," "local undo vs permanent history." Cursor: "Revert
the changes… and run it again," isolated worktrees. Reversibility is what *licenses* ambitious autonomy.
**Clara — adopt the substrate, respect the accounting boundary (this is the sharpest AVOID).**
- For **drafts and evidence prep** (pre-post, reversible): adopt checkpoint-grade reversibility — a
  clean "discard this draft / roll back this batch / refine the plan and re-run" affordance so the human
  can let Clara attempt ambitious multi-step work knowing it is undoable. This is what makes AUTO-drafts
  safe to let run.
- For **posted GL entries** (committed, statutory): **there is no rewind.** A posted entry is legally
  immutable; the only correction is an audited **reversal** (reverse-not-delete, a PRD invariant). A UI
  "undo the books" affordance would be an accounting-correctness violation — exactly the kind of
  naive-copy error the precedence rule guards against. The design must make the *draft* freely reversible
  and the *posted* entry reversible-only-by-reversal, and never blur the two.
**Accounting twist.** Claude's own framing ("checkpoints = local undo; Git = permanent history") maps
cleanly: **the draft layer is local-undo; the posted GL is permanent history.** The audited write path
is Clara's "version control," and it is append-and-reverse, never rewrite.

### P7 — A dedicated verification pass; "in balance" is necessary, not sufficient
**Source.** Codex intent-vs-diff review that "executes code and tests to validate behavior," flags P0/P1
only. Cursor Review→Find Issues, @Branch, Bugbot — and the honest law: **"Passing tests don't guarantee
the code works correctly."** Verification is a *separate, deliberate* surface, not a side effect.
**Clara.** A **verification lane** distinct from the approval gate: control-account tie-outs, bank-recon
structural parity (amount/date/account/period — GAP1-1/1-2), balance (Σdr=Σcr), SST leg correctness,
subledger-vs-GL agreement, period-continuity segment checks. Surface the *reason* on every judgment
(J-19 inverts this today by hiding the reason sr-only; J-21 buries the "why" in the drawer). Adopt
Codex's **focus-on-serious-issues** posture: don't drown the reviewer — flag the P0/P1 equivalents
(unbalanced, cross-tenant risk, stale subledger, tax mismatch) prominently.
**Accounting twist — the "passing tests ≠ correct" law is load-bearing here.** The audit found
`build_export` hard-codes `balanced:true` and the UI renders an unlabelled green "In balance" chip
(H-2). A green balance chip is Clara's "passing test": necessary, **never sufficient**, and never
model-authored. Every figure and every verification claim must be **DB-derived**; the chip must state
what it checked and must never launder model bytes as DB-authoritative.

### P8 — Runs are durable, resumable, interruptible, and background-capable
**Source.** Codex cloud tasks run in dedicated environments, watched or backgrounded, listed with
status; parallel tasks. Claude: checkpoints saved *with the conversation* so a resumed session rewinds;
`Esc` interrupts "keeping the work done so far"; background tasks/subagents survive; session recap on
return; PR-status badge refreshing every 60s. Cursor: isolated worktrees, foreground/background plans,
resumable. **The run outlives the window, the restart, and the wait.**
**Clara — the UX face of Cluster A (Grt-1…15).**
- **Survive restart:** a close/onboarding that is mid-flight when the service redeploys must **resume**,
  not vanish (Grt-1/7). The plan-checklist, the parked clarification, the pending approval, the partial
  postings — all DB-backed and re-attachable.
- **Resume days later:** a close paused waiting on a client bank statement, or an onboarding awaiting a
  document, resumes when the answer arrives — surfaced at client-work-start as an open-question object
  (Gate-1 C1 must-ask) and via a **session-recap** ("Where we left off: FY2025 close, 3 of 7 steps done,
  waiting on the March bank statement").
- **Interrupt & steer, keep work-so-far:** the human can stop Clara mid-run to redirect without losing
  completed steps (Claude's `Esc` model) — critical when a reviewer spots a mis-coding partway through a
  batch.
- **Background / long-running honesty:** the Jobs lane must adopt the **heartbeat/staleness** pattern
  (J-6: a dead runner shows a live bar forever) — mirror Claude's periodic-refresh + explicit states
  (running / stale "state unknown — runner offline" / done / failed), never an eternal spinner.
- **No double-post on re-drive:** idempotent resume (treat already-approved as success — Grt-11) so a
  restart never re-posts. The DB approve gate already blocks the double-post; the UI must reflect
  *success*, not a false red FAILED.
**Accounting twist.** Codex's "isolated environment per task" and Cursor's "isolated worktree per agent"
map to **firm/client-scoped isolation** — parallel background work across clients must never cross
tenant boundaries; the isolation that prevents *merge conflicts* for coding agents prevents *cross-tenant
posting* for Clara, the firm-killing mistake.

### P9 — Task-centric, review-first, multiplexed interface with cross-scope "needs-you"
**Source.** Cursor 2.0 "centers on agent management rather than file navigation," up to 8 parallel
isolated agents, consolidated cross-file review. Codex lists parallel tasks with status. Claude surfaces
external status (PR badge) and session recap. The interface is organized around **work items and their
review state**, not around a single live chat.
**Clara.** The workbench + inbox already embody this (the audit rates it strong); the gaps are
**cross-scope awareness** and **state projection**:
- **Cross-scope needs-you (J-28):** a blocking clarify in Client A must badge a global count + jump list
  while the user is in Client B — "a clarify never times out silently." Project pending
  clarifies/undecided plans into the DB-backed inbox needs-decision lane. This is the multi-client analog
  of Codex's parallel-task list.
- **State projection (J-12):** a work item's card must reflect DB-owned status *everywhere* — approve in
  the grid and the rail card self-resolves; no stale-actionable Approve button on an already-posted entry
  (the audit found rehydrated cards re-render live Approve). One work item, one truth, many views.
- **Review-first density:** consolidated review across many entries (Dr|Cr columns, footer Σ that ties,
  multi-status filters, bulk verbs with a summary — J-14), the accounting analog of Cursor's "view all
  changes without jumping between files."
**Accounting twist.** For a multi-client firm the "eight parallel agents" pattern is **many clients'
work in flight at once**; the organizing surface is the firm-level attention queue (what needs a human,
in which client, at what stake), and it must be DB-durable so nothing waits invisibly.

### P10 — Structured references both directions; the agent drives reads, the human owns writes
**Source.** Cursor `@Branch`/`@file` and Claude `@`-file-mention / `[Image #N]` chips = precise
structured references, not prose. Codex/Cursor let the agent **open files, show diffs, focus** — the
agent drives the *read* surface; the human retains the *write* decision. Claude plan mode + auto-mode:
the agent navigates and proposes; edits still gate.
**Clara.**
- **Workbench→agent (fix J-7):** send structured context (entry ids, document ids, filter descriptors),
  not a lossy "Re 14 Apr · Director loan" label; add "Ask Clara about these N" on a multi-row selection.
- **Agent→workbench (fix J-8):** widen the one-verb (`filter_journals`) channel to a **read-only
  directive union** — `open_view`, `focus_entity`, `apply_filter` (carrying period) — each an attributed,
  one-click-undo chip like the existing filter directive. "Show me the unreconciled ones" ends with the
  recon tab open and focused.
- **Entity chips in prose (J-10):** every entity Clara mentions ("entry JE-841 for Tenaga") renders as a
  navigable chip, not just inside artifact cards.
- **URL as source of truth (J-13):** tab/filter/band/period state mirrors to the URL so reload, share,
  and back/forward work, and Clara's deep-links land in a live context.
**Accounting twist — the read/write asymmetry is a safety property, not just ergonomics.** The agent may
freely drive *reads* (open, filter, focus, highlight) because reads are ungated (supervised-autonomy
law); it may **never** drive a write through that channel. The audit's SDT-001 (a read tool that can
write) is the failure of exactly this asymmetry — the design must keep the agent→UI channel structurally
read-only, mirroring how Claude/Codex let the agent navigate but gate every edit.

### P11 — Learned shortcuts require a human gate and never lower a floor
**Source.** Claude auto-mode "always-allow rules for trusted patterns" (user-configured); Codex per-repo
`AGENTS.md` review guidance. The pattern: **the human teaches the agent a trusted shortcut**, explicitly.
**Clara.** The "always allow this pattern" analog is a **user-gated KB account-mapping rule** (Gate-1 B,
Layer 2 typed authority). But the accounting twist is decisive: **the wiki/rule INFORMS but never
DECIDES an account or lowers the ≥0.95 gate** (C3/B). A learned rule may pre-fill and cite provenance; it
may **never** auto-post below the confidence gate or bypass the high-stakes distinct-approver. Surface
the firing rule + prior-match count + reason at the point of decision (J-21), so the human sees *why the
shortcut fired* and can reject it — the KB workbench is the visible, governable memory manager the audit
already praised.

---

## 4. ADOPT / AVOID

### ADOPT
| # | Pattern | Because | Fixes |
|---|---|---|---|
| A1 | **Plan-as-document**: editable, reorderable, per-step status, approve step-or-batch | Deciding *what* to post is the hard part; big work needs a governable artifact | J-1, J-2 |
| A2 | **Honest streamed progress**: status line + one chip per tool call + live DB-backed checklist; ban "working…" | A long run must never read as a hang; volume must be legible | J-4, Grt-3/9 |
| A3 | **Durable, inspectable tool-call/reasoning trail** (expandable, repetition collapsed) | 7-year evidence, not debug convenience; proves every number is DB-derived | Grt-3/9/10, H-1/2 |
| A4 | **Two diffs**: legs before/after **and** source-doc↔entry side-by-side with evidence regions | Diff is the review surface; evidence-vs-entry is the trust thesis | J-3, J-18 |
| A5 | **Graduated boundary-based approval** mapped to DB-owned write classes + role floors + high-stakes distinct-approver | Rejects both approval-fatigue and blanket-auto; boundary is DB, not model | J-5, C3, C4, GAP0/GAP3 |
| A6 | **Reversibility for drafts** (discard/rollback/refine-and-rerun) as the license for ambitious AUTO work | Reversibility is what makes autonomy safe | Grt-5, autonomy law |
| A7 | **Dedicated verification lane** (tie-outs, parity, balance, SST, continuity); flag serious-only; reason on every judgment | "Passing tests ≠ correct"; a green chip is necessary not sufficient | J-19, J-21, H-2, GAP1-1/2 |
| A8 | **Durable/resumable/interruptible runs**: survive restart, resume days later, interrupt keeping work-so-far, idempotent re-drive | The run outlives window/restart/wait; no double-post | Grt-1/5/6/7/11/12 |
| A9 | **Heartbeat/staleness on background jobs** (running / stale / done / failed), periodic refresh | A dead runner must never show a live bar | J-6 |
| A10 | **Cross-scope needs-you** (badge count + jump list) + **state projection** (one work item, one truth) | A clarify must never wait invisibly; cards must reflect DB status everywhere | J-12, J-28 |
| A11 | **Structured references both ways** (entity ids in, read-only directive union out, entity chips, URL-as-truth) | Precise references, not vibes; agent drives reads, human owns writes | J-7, J-8, J-10, J-13 |
| A12 | **Session recap on return** to a paused workflow ("where we left off") | Long/paused jobs must re-orient the human instantly | Grt-1/7 |
| A13 | **Human-gated learned shortcuts** (KB rules) that cite provenance but never lower a gate | Teach trusted patterns explicitly; never auto-lower the floor | C3, B, J-21 |
| A14 | **Isolation per concurrent unit** (firm/client-scoped) for parallel/background work | Isolation prevents cross-tenant posting, the firm-killing mistake | C3, cross-tenant |

### AVOID
| # | Anti-pattern | Because |
|---|---|---|
| V1 | **A "rewind/undo the books" affordance on posted entries** | Posted GL is statutory and immutable; correction is reverse-not-delete only. Copying Claude's file-checkpoint model onto posted entries is an accounting-correctness violation. Rewind belongs to **drafts only**. |
| V2 | **A single green "in balance" chip as the trust signal** | "Passing tests ≠ correct." Balance is necessary, not sufficient; the chip must state what it checked and be DB-derived, never model-asserted (H-2). |
| V3 | **Approve-only gates** | Rejection-only forces re-runs; Edit and Reject-with-reason must be first-class in chat *and* grid (J-1). |
| V4 | **Fire-and-forget success toasts** ("Clara is filing them") on a POST that isn't driven | The primary upload surface silently does nothing today (D-1/E-1); never toast success on an unattached run. |
| V5 | **A read tool that can write** (lexical-filter "safety") | The agent→UI/read channel must be *structurally* read-only; SDT-001 is the failure of the read/write asymmetry. |
| V6 | **Blanket auto-mode / "bypass all approvals" for consequential writes** | Even Anthropic says auto-mode "isn't a drop-in replacement for careful human review on high-stakes infrastructure." The professional never-auto floor is absolute (C4). |
| V7 | **Per-action approval fatigue on every reversible read/draft** | Both Codex and Claude deliberately let in-scope reversible work flow; gating reads/drafts trains the human to rubber-stamp. Gate at the *consequential boundary*, not everywhere. |
| V8 | **Confidence as a raw digit in the DOM** | The vocabulary is a shaped band, never "87%" (J-20); a naive numeric copy breaks the trust language. |
| V9 | **Invisible bulk actions** (bulk-approve with no per-item summary) | Codex/Cursor always show the diff/summary before merge; bulk must show what it will post (J-5). |
| V10 | **Thread-local / process-local run state** | The whole Cluster-A failure; state must be DB-backed so it survives restart and projects consistently (Grt-1, J-12). |
| V11 | **Copying "8 parallel agents on one prompt" as speculative multi-drafting of the same entry** | Parallelism in coding is exploration; for the books, parallel *conflicting* drafts of one posting invite confusion and double-post risk. Parallelize across independent units (clients/documents), not across competing versions of one commit. |

---

## 5. Mapping to Clara's four workflows

**Onboarding.** PLAN: an editable onboarding checklist (entity facts, COA mapping, opening balances,
counterparty seed, period setup) — each step reviewable (P1). SHOW: honest progress across the interview
(P2). GATE: opening balances are Tier-3 high-stakes (distinct-approver / self-attest; one-shot DB guard
against the double-seed the audit found). RECOVER: the interview is **durable and resumable** — a
redeploy mid-onboarding must not lose answered questions (Grt-5/7); unanswered items become must-ask
objects surfaced at next client-work-start (C1); session recap re-orients on return (P8/P12).

**Close.** PLAN: the close is the canonical plan-as-document — ordered steps (bank recon, accruals,
depreciation run, SST return, inventory closing-stock, FS with SOCE+notes, tax-comp last), each showing
its full side-effect chain and compliance mapping (P1, Gate-1 C5). SHOW: live per-step checklist +
progress + heartbeat (P2, P8/A9). GATE: the close is Tier-3 high-stakes with a HARD distinct-approver
(C4); serialize it (the audit found it races every writer). VERIFY: control tie-outs, continuity-segment
checks, balance — flagged serious-only; no unlabelled green chip (P7, V2). RECOVER: resumable across
restart and across a days-long wait for a client document (P8, P12); reversal is ordered and gated (never
mirror into a locked period).

**Reconciliation.** SHOW/DIFF: a matched-pair diff — this statement line ↔ this entry, with the
structural-parity check (amount/date/account/period) surfaced *before* the match commits (P4, P7, fixes
GAP1-1/1-2). GATE: matching is reversible — **one-click unmatch** (draft-layer reversibility, P6), never
a ghost "reconciled" overwrite. VERIFY: entry-exclusivity + completed-reconciliation guard visible in
the UI. The agent may *drive the recon view open and focus a candidate* (read-only directive, P10) but
the human commits the match.

**Coding review (daily driver).** DIFF: the **source-doc ↔ proposed-entry side-by-side** with evidence
regions is the primary surface (P4/J-18); the why-popover (firing rule + prior-match count + reason +
doc link) answers "why 620-100?" at a glance (P7/J-21). GATE: one coherent, *stated* approval ergonomic
across grid / drawer / bulk, with Edit and Reject-with-reason first-class and a per-item summary on bulk
(P5/A1, fixes J-1/J-5). SHOW: OCR+coding progress is legible (P2). LEARN: a confirmed correction can
become a human-gated KB rule that cites provenance but never lowers the ≥0.95 gate (P11/A13). Because
AUTO drafts at volume, the review surface must make the drafted/needs-you/auto-posted split legible and
never hide it behind a spinner (P2, V2).

---

## 6. Crosswalk — principle → audit finding resolved

| Finding | Resolved by |
|---|---|
| **Grt-1/6** no durable run state | P8 (durable/resumable runs) · A8/A10/V10 |
| **Grt-5/7** clarify/interview lost on restart | P8/P12 (resume + recap) · A8/A12 |
| **Grt-3/9/10** tool-call/artifact history never persisted | P2/P3 (durable inspectable trail) · A2/A3 |
| **Grt-11** re-drive miscount / double-post risk | P8 (idempotent re-drive) · A8 |
| **Grt-12** wakes lost on restart | P8/P9 (durable attention queue) · A8/A10 |
| **Grt-13** no post-workflow outcome-sync | P7 (verification/outcome-sync surface) · intrinsic side-effect chain (C2) |
| **J-1** Approve-only chat cards | P1/P5 (plan card w/ Edit + Reject-with-reason) · A1/V3 |
| **J-2** no multi-step plan surface | P1 (plan-as-document) · A1 |
| **J-3** no diff/before-after | P4a (legs diff) · A4 |
| **J-4** invisible process | P2/P3 (status line, tool chips, checklist) · A2/V-anti-spinner |
| **J-5** inconsistent approval friction | P5 (one graduated model; bulk summary) · A5/V9 |
| **J-7** lossy workbench→agent refs | P10 (structured references in) · A11 |
| **J-8** one-verb agent→UI channel | P10 (read-only directive union) · A11 |
| **J-12** thread-local card state | P9 (state projection) · A10/V10 |
| **J-13** URL not source of truth | P10 (URL-as-truth) · A11 |
| **J-18** no evidence-region/side-by-side | P4b (evidence diff + region capture) · A4 |
| **J-6** dead runner shows live bar | P8 (heartbeat/staleness) · A9 |
| **J-19/J-21** reason hidden / buried | P7 (reason on every judgment) · A7 |
| **J-20** raw confidence digit | shaped-band vocabulary · V8 |
| **J-28** cross-scope clarify invisible | P9 (cross-scope needs-you) · A10 |
| **H-2** "in balance" laundering | P7 (DB-derived, stated checks) · V2 |
| **GAP1-1/1-2** bank-match integrity | P4/P7 (parity check + reversible unmatch) · A7/reconciliation §5 |

---

## 7. Open questions / drift-protocol flags for Gate 2

1. **Rewind vs reverse boundary (V1)** — needs an explicit design ruling and a visible UI convention so
   a draft "rollback" is never confusable with undoing a posted entry. This is an accounting-correctness
   vs design-ergonomics collision → clarify + verify with the owner (drift protocol) before building.
2. **Parallelism model (V11)** — confirm the rebuild parallelizes across independent units
   (clients/documents/close-steps), not across competing drafts of one commit. Ties to the runtime
   durable-job model (`runtime-research.md`).
3. **Interrupt-keeping-work-so-far semantics** — for accounting, "keep work so far" must mean *keep
   completed, receipted steps*; define what a half-finished consequential step does on interrupt (must
   be all-or-nothing at the audited-fn boundary, never a torn write). Cross-check with the co-commit
   ledger design.
4. **Plan-as-document persistence** — is the close/onboarding plan a first-class DB object (versioned,
   auditable, the intended-vs-actual record) or a transient UI artifact? Recommend first-class + durable,
   since it doubles as the audit trail of intent.
5. **Verification-lane authorship** — confirm every verification claim (parity, tie-out, balance) is
   DB-derived and that no model prose can enter it (H-series). This is a Phase-5 verification-design tie-in.

---

## Sources (all fetched 2026-07-17)

**Claude Code (Anthropic)**
- Checkpointing / rewind — https://code.claude.com/docs/en/checkpointing
- Interactive mode (status, transcript viewer, task list, background tasks, PR badge, recap, Esc-keeps-work) — https://code.claude.com/docs/en/interactive-mode
- Enabling Claude Code to work more autonomously (checkpoints, subagents, background tasks) — https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously
- How we built Claude Code auto mode (three-tier guardrail, boundary config, escalation) — https://www.anthropic.com/engineering/claude-code-auto-mode
- Plan mode / permissions — https://docs.claude.com/en/docs/agent-sdk/permissions (plan-mode behavior)

**OpenAI Codex**
- Agent approvals & security (three approval modes, sandbox-as-boundary) — https://learn.chatgpt.com/docs/agent-approvals-security (redirect from developers.openai.com/codex/agent-approvals-security)
- Codex cloud (delegate/watch/review summary+diff, parallel tasks, environments) — https://learn.chatgpt.com/docs/cloud (redirect from developers.openai.com/codex/cloud)
- Review GitHub pull requests / Code review (intent-vs-diff, P0/P1 focus, AGENTS.md guidance) — https://developers.openai.com/codex/use-cases/github-code-reviews · https://developers.openai.com/codex/app/review
- Introducing upgrades to Codex (terminal UI: tool calls & diffs better formatted) — https://openai.com/index/introducing-upgrades-to-codex/ (via search snippet; page returned 403 to direct fetch)

**Cursor**
- Plan Mode (docs) — https://cursor.com/docs/agent/plan-mode
- Introducing Plan Mode (blog: editable markdown plan, parallel plans, rationale) — https://cursor.com/blog/plan-mode
- Reviewing and Testing Code (diff-as-it-happens, Review→Find Issues, @Branch, Bugbot, "passing tests ≠ correct") — https://cursor.com/docs/agent/review
- Best practices for coding with agents (plan first, watch/Stop, review discipline) — https://cursor.com/blog/agent-best-practices
- Changelog 2.0 (task-centric Agent Interface, up-to-8 isolated parallel agents, consolidated review) — https://cursor.com/changelog/2-0
