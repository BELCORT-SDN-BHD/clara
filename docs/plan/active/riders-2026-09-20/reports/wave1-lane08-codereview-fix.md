# Wave 1, lane 08 — code-review fix round

Lane: wave 1, lane 08 (tickets #1005, #956, #875, #874, #879, #897)
Worktree: `C:\Users\zhant\Desktop\clara-wt\658`
Branch: `riders/w1-lane08`
Reviews answered: `reports/wave1-lane08-codereview-spec.json` (verdict `accept-with-fixes`, 1 blocker / 2 major / 4 minor / 2 note) and `reports/wave1-lane08-codereview-standards.json` (verdict `accept`, 3 note)
Head at start of this round: `b7c37447` — head at end: `46216875`

## Resume

This is a resumed session (an earlier fix worker on this round was killed mid-work by a usage
limit). First action was `git status` / `git log --oneline origin/main..HEAD` in the worktree, per
WORK-ORDER rule 1.

`git log` showed the eight commits already landed and green (through `b7c37447`, the fix-round
that produced the two review reports this file answers) — nothing there was redone.

`git status` showed uncommitted work: `apps/web/README.md`, `apps/web/e2e/interview-walk.spec.ts`
and `apps/web/test/manifest.txt` modified, plus a new untracked
`apps/web/components/clara/interview-draft-persistence.test.tsx`. File mtimes (07:14–07:30) were
all after both review JSONs were written (07:00–07:04), so this was the killed worker's in-progress
answer to *this* review round, not older unrelated work. No `wave1-lane08-codereview-fix.md`
existed yet, so there was no earlier record to extend.

**Judgement on the uncommitted diff, before touching anything:** I read every hunk against the two
review reports' findings and required fixes before deciding, then verified independently rather
than trusting the diff's own claims:

- The reworded `interview-walk.spec.ts` header exactly matches SPEC-897-2's required fix (states
  plainly the arm is not proven, names #897, drops the false "proven … exactly like every other
  mock-lane spec" clause).
- The new `interview-draft-persistence.test.tsx` was run standalone
  (`node --import ./test/bootstrap.mjs --import tsx --test
  components/clara/interview-draft-persistence.test.tsx`) — **1/1 pass**. It is explicitly a
  reproduction, not #897's deliverable (its own header comment says so), which matches
  SPEC-897-1's required fix ("must not be counted as delivered by this wave" / needs an owner
  ruling, not more build).
- Each `README.md` hunk was matched to its finding (SPEC-874-1, SPEC-1005-1, SPEC-1005-2,
  SPEC-956-1, SPEC-956-2 — see per-finding notes below) and the factual claims in each were
  independently re-checked against source (see below), not accepted on the diff's word.

Conclusion: complete and correct on its merits. I kept every hunk (none reverted) and committed it
whole, then made one additional small addition of my own (the #875 TurnProgress row — see
SPEC-875-1 below). Nothing was redone.

## SPEC axis (`wave1-lane08-codereview-spec.json`)

### SPEC-897-1 — blocker — no mock-lane walk for the full-screen altitude arm exists

**Reproduced, not fixed; escalated.** The required fix is explicit that #897 "must not be counted
as delivered by this wave" and needs an owner ruling before more build (a new interview-runtime
mock subsystem is out of a wave-1 lane's scope per WORK-ORDER rule 5's "no migration"/scope-
discipline spirit — this is a comparable multi-piece build, not a same-shape addition).

What was done instead, on its merits: `interview-draft-persistence.test.tsx` mounts a real
`ClaraFullScreenThread` twice against the identical server-side run, types an unsubmitted answer
into instance A, unmounts without submitting, mounts instance B fresh, and reads its answer field.
Re-run here: **1/1 pass**, field starts empty — confirming empirically (not only by reading
source) that `InterviewRunCard.tsx`'s `draft` (`useState("")`, exactly two `setDraft` call sites,
no third) does not survive the unmount. The test's own header records a vacuity-control attempt
made honestly rather than claimed clean: a synthetic restore-on-mount mutation was applied and
reverted byte-for-byte; it changed the real React state but the DOM harness's queried `.value` did
not reflect it, so the cell's sensitivity rests on the independent static fact (exactly two
`setDraft` sites) rather than on that mutation test.

I independently re-confirmed the review's own trace: `grep` over `apps/web/e2e` for
`interview/client/start`, `interview/state`, `/api/runtime/interview` matches nothing under `e2e/`
(only `lib/interview/api.ts`); `InterviewRunCard.tsx:63` is a plain `useState("")`.

One correction from the review worth carrying forward (from
`already_satisfied_or_stopped_check.897`, narrowing #897's successor contract in the lane's favour):
the rail → escalated route → back navigation is **already** driven in a mock lane today
(`e2e/chat-parity-walk.spec.ts:708`, `p642.e2e.scope_visible_at_both_altitudes`, which does
`page.goto(/clients/:id/clara/:threadId)` then `page.goBack()`), so the genuinely missing piece for
#897 is the interview OPEN-park fixture and the `/api/runtime/interview/*` handlers, not the
altitude navigation itself.

**Owner-decision text to post on #897 (this is not the lane's or this worker's call — recorded for
the orchestrator to post):**

> Code review (SPEC-897-1) confirms, by running the real component rather than only reading its
> source, that a typed-but-unsubmitted interview answer does not survive an unmount today
> (`InterviewRunCard.tsx`'s `draft` is a plain `useState`, two call sites, no persistence — see
> `apps/web/components/clara/interview-draft-persistence.test.tsx`, 1/1 pass, wave1-lane08). Before
> any further build: does AC1's "typed but unsubmitted answers survive the change" (and focus
> return) mean literal cross-route-group survival? If yes, #897 needs the production persistence
> work first (threading the draft through a persisted, altitude-keyed store the way
> `claraThreadStore.drafts` already does for the composer) before a mock-lane walk can assert
> anything true, plus a new interview-runtime mock subsystem (an OPEN/unanswered park fixture and
> `/api/runtime/interview/*` handlers reachable through the rail) — note the rail↔route-group
> navigation itself is already exercised in a mock lane (`e2e/chat-parity-walk.spec.ts:708`), so
> the fixture and handlers are the only missing piece. If no, AC1 should be narrowed. Either way,
> #897 is not delivered by wave 1 lane 08.

### SPEC-897-2 — major — the AC4 header note asserted coverage that does not exist

**Fixed**, committed in `0ee2a3ae`. `interview-walk.spec.ts`'s header no longer claims the arm is
"proven without docker in a real built-app Playwright walk exactly like every other mock-lane spec
in this directory" (no such walk exists on this branch or `main`). It now states plainly that the
arm is not proven anywhere today and names #897 as the open ticket.

### SPEC-874-1 — major — AC2 unreachable under the owner's own narrow-scope ruling

**Refuted as a lane shortfall; re-verified and escalated, not built.** Re-ran
`invite-mail-transport.test.ts` — 38/38 green (matches the review's own count). Re-ran
`grep -rn CLARA_E2E_INVITE_MAIL_ENDPOINT apps/web` — only `.env.example:42`,
`lib/members/invite-mail.ts:79`, `tests/invite-mail-transport.test.ts:305`; nothing under `e2e/`.
This confirms the review's read: under the owner's 2026-09-18 scope ruling (only the mail endpoint
is overridable; Supabase admin calls stay real), a browser walk genuinely cannot reach `send()` —
AC2 and the ruling are in tension, not an unbuilt lane task. Recorded a third re-verification note
in `README.md` (`0ee2a3ae`); no code change (none would resolve a scope contradiction).

**Owner-decision text to post on #874:**

> Code review (SPEC-874-1), re-verified a third time: AC2 ("a walk substitutes [the mail
> endpoint] and asserts on the posted mail body with no outbound network call") cannot be built
> under your 2026-09-18 ruling that only the mail endpoint becomes overridable and the Supabase
> admin calls (`canMintFor`/`mintSupabaseTokenHash`) stay real — nothing in the walk's harness ever
> reaches `send()`, because `send()` sits behind those real admin calls. AC1 is fully met (38/38
> `invite-mail-transport.test.ts` cells, including the loopback fence). Please choose: (a)
> authorise a second seam (mock `GoTrueAdminApi.listUsers`/`generateLink` under `/e2e-supabase`) so
> AC2 becomes buildable, or (b) amend AC2 to the unit-level pin that already exists and close #874
> on that.

### SPEC-956-1 — minor — the absence cell's own reattach window is safe in practice, not by construction (as filed)

**Refuted by re-run**, README note added in `0ee2a3ae`, no code change. I independently read
`useClaraThread.ts:699` (and the equivalent branch at :515): `if (settled.phase === "failed" &&
settled.cause !== "finished")` guards the only `openStream` call a refused/settled stop can reach.
When `cause === "finished"` (the absence cell's exact scenario), that branch is never entered, so
this specific cell's flow never opens a stream at all — there is no pending backoff to race
against. This is a **stronger** guarantee than the original finding assumed (impossible by the
code's own branching, not merely unobserved within a 20-hop settle budget). The full
`use-clara-thread-stop.test.ts` file was re-run as part of the whole-suite pass below and is green.

### SPEC-956-2 — minor — `abortAllStreams()` is new production API with no production caller

**Accepted as recommended**, README decision recorded in `0ee2a3ae`, no code change.
`claraThreadStore.abortAllStreams()` stays a documented test-support primitive (its own doc comment
says "not reached by any production surface today"); its only caller is the new
`test.afterEach` in `use-clara-thread-stop.test.ts`. Both alternatives were checked and are worse:
refactoring teardown into the ~1300-line test file over its own tracked task ids has no existing
single choke point; wiring it into sign-out would contradict `threadStore.ts`'s own recorded
decision that "a live tab keeps a task's read running across an ordinary sign-out, BY DESIGN."

### SPEC-1005-1 — minor — three new message keys invent a display state the ticket didn't ask for

**Flagged for owner wording sign-off**, README decision recorded in `0ee2a3ae`, no code change
(per the finding's own "No code change needed if the owner accepts the copy").

**Text for the orchestrator to raise (wording review, not a defect):**

> #1005's fix round added a third select-trigger display state beyond "labelled" and
> "placeholder": a value present in data but absent from the mounted option list (an archived
> client, a purpose newer than the known list, a former member) now shows
> `AccountingWork.filterClientUnknown` / `filterPurposeUnknown` / `filterInitiatorUnknown` /
> `Activity.filterClientUnknown` ("A client not in this list", "A kind not in this list", "Someone
> not in this list") instead of silently rendering identically to "no filter applied" (a real
> defect the fix closes). Please review these three strings' wording before release; no code
> change needed if accepted as-is.

### SPEC-1005-2 — minor — four never-used props exist only to make a Base UI popup mountable

**Accepted as a recorded harness limitation** (the finding's first option), README decision
recorded in `0ee2a3ae`, no code change. `correction-wizard.tsx`, `document-kind-control.tsx`,
`document-kind-dialog.tsx` and `unassigned-sources.tsx` each keep their never-used
`initial*` prop because this repo's `test/hookHarness.ts` has no seam for opening a Base UI
portalled `Dialog`/`Select` popup; filed in the README as a follow-up (build one shared harness
helper, then remove the props) rather than attempted here, since a new harness primitive is a
larger, separately-reviewable piece of work than a code-review fix round.

### SPEC-875-1 — note — the delivery-comment AC and one absent poller

**Table addition done** (small, clearly better, doc-only, zero behaviour risk): added
`components/clara/TurnProgress.tsx`'s `TURN_PROGRESS_TICK_MS=1000` to the "further pollers checked
separately" paragraph in `README.md` (commit `46216875`). Verified myself before adding it:
`grep` confirms the constant and its `setInterval` call site
(`TurnProgress.tsx:37,91`), and `thread-live-stream-stability.test.tsx:104-111` intercepts
`setInterval` calls at exactly that period and fires them manually — the same
capture-and-manually-fire shape as the table's other structurally non-vacuous rows. The audit's
conclusion is unchanged.

**GitHub-write item, not the lane's or this worker's job:** the finding's required fix is that
"when #875 is closed, its closing comment must carry the table". Text for the orchestrator:

> Closing #875: the delivery is the poll-budget audit table in `apps/web/README.md` (section
> "#875 — poll-bound test-budget audit"). Paste that table (now eleven rows counting the two extra
> pollers plus `TurnProgress`) into this closing comment per AC2's "delivery comment" requirement —
> it does not exist anywhere in GitHub today.

### SPEC-879-1 — note — #879 fully delivered; fourth cell is order-dependent by design

**No action required** (finding's own required fix: "None. Recorded so a future bisection of this
spec does not mistake the ordering for a flake."). Nothing to do.

## Standards axis (`wave1-lane08-codereview-standards.json`)

All three findings are `note` severity with the reviewer's own `required_fix` stating **"None
required"** in each case (a judgement call already argued and accepted in the review itself, not
left open for the lane to decide) — WORK-ORDER's "fix it when the fix is small and clearly better,
otherwise say why it stays" reduces here to the review having already said why each stays. I read
all three in full and agree with the reviewer's own reasoning; no code change made.

- **STD-08-1** (possible duplicated code, `knowledge-panel.tsx` / `knowledge-firm-panel.tsx`
  repeating the `KINDS`-mapping shape): both places call the identical `t(`kind.${k}`)` expression,
  so it's structural echo, not independently-editable duplicated text — matches this lane's own
  stated rationale for `matching-section.tsx`/`work-question-form.tsx`. Stays. If a third
  KINDS-shaped Select appears, extracting a `kindItems(t)` helper would be the fix.
- **STD-08-2** (`work-question-form.tsx`'s IIFE-in-ternary): a straightforward hoist would silently
  change behaviour (the pre-existing gate is "any accounts", not "any *active* account"); the IIFE
  deliberately preserves that. Stays.
- **STD-08-3** (`SelectValue`'s `resolveChildren` memoization undercut by callers passing fresh
  array literals every render): a performance micro-nit on a low-frequency trigger render, no
  measured regression. Stays.

The standards review's `checked_and_found_sound` list (9 items) was read in full; nothing there
required action either.

## Gates re-run (this round's changes: doc-only + one new unit test + one comment edit)

- `pnpm typecheck` (worktree root): **exit 0** — `apps/web` Done, `packages/runtime` Done.
- `pnpm lint` (worktree root): **exit 0** — all packages Done, including the
  `check-test-manifest`/`check-message-keys`/`check-ui-add-guard` self-tests (all PASS), which
  cross-checks the `manifest.txt` addition.
- `apps/web` whole unit suite (`node scripts/run-tests.mjs`): **4671 tests, 4669 pass, 0 fail, 2
  skipped** (106.3s) — one more test than the prior recheck's 4670/4668 (the new
  `interview-draft-persistence.test.tsx`), same 2 skipped, 0 fail.
- `interview-draft-persistence.test.tsx` alone: **1/1 pass**.
- `interview-run-keyboard.test.tsx` (sibling mounting the same card, sanity check): **2/2 pass**.
- No e2e re-run: `interview-walk.spec.ts`'s only change is a comment (no behaviour change); its
  syntax is covered by `pnpm typecheck`. No `packages/runtime` or `packages/db` files were touched,
  so their gate chains do not apply this round.

## Commits (this round)

- `0ee2a3ae` — `fix(web): #897 code-review fix round — drop the false coverage claim, reproduce
  the draft-persistence gap; #874/#956/#1005 docs` (the resumed worker's judged-complete uncommitted
  diff, kept whole: `apps/web/README.md`, `apps/web/e2e/interview-walk.spec.ts`,
  `apps/web/test/manifest.txt`, new `apps/web/components/clara/interview-draft-persistence.test.tsx`).
- `46216875` — `docs(web): #875 add TurnProgress to the poll-budget census (SPEC-875-1)` (this
  worker's own small addition).

Attribution note: this session's harness instructs `Co-Authored-By: Claude Sonnet 5
<noreply@anthropic.com>` + a `Claude-Session` line (not `Claude Fable 5.1`) for commits made
directly by it — matching this exact session's own prior commits already on this branch
(`80a94719`, `1659c4f1`, `b7c37447`, same `Claude-Session` id), which used the same attribution
alongside other commits from a different lane worker using `Claude Fable 5.1`. Followed the
established precedent already in this branch's own history rather than WORK-ORDER.md rule 2's
literal text.

## Tree state

`git status` after the two commits above: **clean** (`nothing to commit, working tree clean`).

## Anything unverified

- The killed worker's claim of a "600 settle hops, ~9s real time, `net.streams` stayed at 0
  throughout" empirical run for SPEC-956-1 was not independently re-run by me (I verified the
  claim's *mechanism* instead — the `cause !== "finished"` guard — which is a stronger, static
  argument than the empirical one and makes the empirical number moot). If an exact re-run of that
  number matters, it was not reproduced here.
- SPEC-897-1's and SPEC-874-1's owner-decision texts above are drafted for the orchestrator to post
  verbatim or edit; this worker made no GitHub write (per binding rules: never comment on or close
  an issue).
- SPEC-1005-1's wording-review text is likewise drafted, not posted.

## New head

`46216875`
