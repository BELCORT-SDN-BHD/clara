# wave1-lane07 code-review fix report

Branch `riders/w1-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`. Fix round for the two
code-review axis reports (`wave1-lane07-codereview-spec.json`, 9 findings CRS-07-01..09;
`wave1-lane07-codereview-standards.json`, 6 findings STD-01..06), reviewed at head `278f0795`.

**Why this file did not exist until now.** An earlier fix worker (killed by a usage limit)
committed five fix-round commits (`981d160a`, `a17f6a87`, `5fe37c2b`, `4c507495`, `308bbecd`,
2026-09-20 07:19–07:31) that fixed the three majors plus four of six STANDARDS findings, and
answered two further minors in commit-message prose — but never wrote this report. The independent
recheck (`wave1-lane07-codereview-recheck.json`, head `308bbecd`) verified that work directly
against the diffs and commit bodies, confirmed it, and left four minors open (CRS-07-07, CRS-07-08,
CRS-07-09, STD-05). This report reconstructs the earlier worker's part from `git log`/commit bodies
(quoted below, not re-litigated) and covers the four remaining findings, fixed in this session.

New head after this session: **`4e85cc0e73ad726cfaba59a2db2448254b7910ce`**.

## Per-finding outcomes — SPEC axis (`wave1-lane07-codereview-spec.json`)

### CRS-07-01 (#987, major) — FIXED, prior worker
The substituted `closedPeriodRefusal` message hardcoded "now closed" / "have that year reopened"
for a refusal that also fires for a fiscal year in `closing` (0056:735/746-749 return early only
for `open`/`reopened`; `closing` is a real, reachable state begin-close sets and the wall's own FY
lookup prefers). Fixed in `a17f6a87d1396ee1585f705acdfce3fde090df4a`: `opening-seed-workbench.tsx`
now branches the message on `error.detail?.fy_status`, adding a `closingPeriodRefusal` key that
names the close run and offers "finish or be abandoned", never "reopened"; the `closed` wording is
unchanged. Test: `opening-refusal-and-staleness.test.tsx` — `"CRS-07-01: drafting an opening item
into a fiscal year still IN CLOSING never says the year is closed, and never points at reopen"`
(green; file re-run this session, 7/7 pass).

### CRS-07-02 (#904, major) — FIXED, prior worker
The tasks poll narrowed every tick to `listProcessingTasksForDocument` alone, so a settling task
left the extraction badge and Facts view frozen at mount-time values with no Refresh offered.
Fixed in `981d160a056594fa389abbc6a947b475c3cef159`: `document-detail.tsx`'s `onTick` now checks
the freshly read tasks — an intermediate tick keeps the narrow one-read cost, the tick where the
last task turns terminal pays one full `reload()` instead, mirroring
`documents-workbench.tsx`'s own settled-tick law for the receipts poll. Test:
`document-detail-live-refresh.test.tsx` — `"CRS-07-02 — the SETTLING tick pays the whole bundle
once, so the extraction badge (and the rest of the panel) catch up with the tasks strip"` (green;
file re-run this session, part of the touched-file gate below).

### CRS-07-03 (#903, major) — FIXED, prior worker
`watermark` was left as `watermark?: unknown` on `ReviewQueueEnvelope` — typed, read by nothing —
the exact half-state the brief forbids. Fixed in `5fe37c2b2ec79501de67c81192a9e753bb5b07ed` by
taking the deletion fork: `watermark` is removed from `ReviewQueueEnvelope` entirely (no
compliance/lint-shaped exception; that precedent predates #903 and was never put to the owner as
an answer to AC2). Test: `use-review-queue.test.ts` — `"903 — watermark is REMOVED from
ReviewQueueEnvelope: no half-state, no dangling reference"` (green).

### CRS-07-04 (#987, minor) — RECORDED, NOT FIXED, prior worker (kept)
The substitution also drops the fiscal-year LABEL the ticket never asked to remove (the refusal's
`detail` carries `fiscal_year_id`, not a label; recovering it needs a new
`clara.list_fiscal_years` read). `a17f6a87`'s commit message and a code comment at the
substitution site in `opening-seed-workbench.tsx` record this explicitly and flag it for the
owner's ruling, citing WORK-ORDER rule 5 (no migration/new-read scope-widening in a wave-1 lane)
as the reason it was left out. Verified this session: the comment is present and its reasoning
holds — `detail.fiscal_year_id` really is the only fiscal-year identifier on the wire
(0056_wave_e_close_model.sql:748-749). Kept as recorded, not re-opened.

### CRS-07-05 (#903, minor) — RECORDED, NOT FIXED / NO CHANGE NEEDED, prior worker
Eight typed `ReviewQueueEnvelope` fixtures had `watermark` stripped from an earlier, reverted
deletion attempt. Since CRS-07-03 was resolved via the deletion fork, their current shape (no
`watermark` key) is now the CORRECT one, not stale residue — `5fe37c2b`'s commit message says so
directly. Verified this session by grep: none of the eight fixture files declares `watermark`,
consistent with the type. No fixture edit was needed or made.

### CRS-07-06 (#876, minor doc-inaccuracy) — FIXED, prior worker
`apps/web/README.md`'s "Three regions on the client tab" paragraph said the mount pays THREE calls
then called the last one "that fourth call" two sentences later, and called the #876 bounded-filings
read "narrower" when it is narrower in rows but nine columns wider than the one-column query it
replaced. Fixed in `4c507495e0ac1541443eca7280c6d377934e8103` (doc-only, no code change): corrected
to FOUR calls and an honest row/column tradeoff statement.

### CRS-07-07 (#900, minor) — FIXED, this session
AC1 asks for "the same label, help AND ERROR behaviour the sibling surfaces show"; the prior round
delivered label and help but left every submit failure — including a refused ANSWER, this field's
own failure — in the card's chrome `StateBanner`, far from the textarea it refuses.

**Fix** (commit `776f4284`): `useInterviewRun.ts` now returns `errorHeldAtPark` — non-null only
when the current error came from `submitAnswer` (`setError`, used by the cancel dialog, and every
read failure always pass `heldAtPark: null`; only `submitAnswer`'s catch arm passes
`park.parkIndex`), so it identifies an answer-submission refusal precisely with no new state to
keep in sync. `InterviewRunCard.tsx` derives `answerFieldError = run.errorHeldAtPark !== null ?
run.error : null` and renders it through `FieldError` (`role="alert"`) inside the answer `Field`,
alongside `aria-invalid` on the `Textarea`; the chrome banner is suppressed for that one case
(`run.error && !answerFieldError`) so the message never doubles.

**Test**: `interview-run-field-composition.test.tsx` — new cell `"900 / CRS-07-07 — a refused
answer renders through FieldError inside the answer Field, not only the chrome banner"`. Drives a
real `/api/runtime/interview/answer` 503 refusal through the component's public seam (types into
the textarea, submits the real form handler — the `onboarding-progress-sync.test.tsx`
`answerCurrentPark` idiom, since the stub DOM has no native form submission), asserts a
`role="alert"` node renders INSIDE the `<form>` carrying the runtime's own message, and that
exactly one `role="alert"` exists on the whole page (no chrome-banner duplicate). Proved red
first: before the fix, the assertion failed with "the refusal must render through a role=alert
FieldError inside the answer Field" (no such node existed) — see the test run captured in this
session's transcript; after the fix, 3/3 pass in the file. No regression in
`useInterviewRun.test.ts` (4/4), `interview-run-keyboard.test.tsx` (2/2, unaffected — no test
there exercises a submit failure), `onboarding-progress-sync.test.tsx` (3/3, unaffected).

### CRS-07-08 (#842, minor scope-creep) — KEPT, RECORDED AS DELIBERATE OVERRIDE, this session
`CENTS_PARTICULARS` was widened from `settled_cents` alone to five keys
(`amount_cents`/`opening_cents`/`closing_cents`/`adjustment_cents`/`settled_cents`) against #842's
explicit out-of-scope line ("Any other basis particular (none is cents-typed today)"), by the
prior worker (`f827f097`, `d4dd2bc2`), with no record that this was a deliberate override.

**Decision, independently re-verified this session**: KEEP the widening. All five keys are
genuinely integer-cents. `clara._adjustment_basis_canonical`
(`packages/db/migrations/0212_payroll_settled_cents.sql:290-332`, unchanged in substance from
`0194_periodic_adjustments.sql:715+`) builds every one of the five keys through the same
`clara._adjustment_cents_value(p_adjustment, <key>)` call, and that function
(`0194_periodic_adjustments.sql:470-475`) returns `bigint` or `null` — never a string, never a
fractional number. The ticket's out-of-scope premise ("none is cents-typed today") does not hold;
narrowing back to `settled_cents` alone would reintroduce the exact defect #842 was opened to fix,
four more times, in the same disclosure.

**Fix** (commit `4e85cc0e`): no code/behaviour change (per the axis report's own "No code change
needed"). The code comment at `CENTS_PARTICULARS` in `periodic-adjustments-table.tsx` now states
the override explicitly: quotes #842's out-of-scope line, cites the migration evidence that
retires it, and flags the four extra keys as outside #842's own acceptance criteria for the
owner's ruling — this report is the other half of that flag, since a lane worker may not write to
GitHub (WORK-ORDER rule 2). Test: `periodic-adjustments-table.test.tsx` re-run green (4/4,
comment-only change, no assertion touched).

### CRS-07-09 (#878, minor weak-evidence) — FIXED (strengthened), this session
The `[878]` cell proved the dialog's SOURCE imports `CLASSIFIABLE_DOCUMENT_KINDS` and calls
`.map(` on it, and never calls the full `DOCUMENT_KINDS.map(` — but a hand-written
`<SelectItem value="consent_evidence">` added beside the map (or a `.flatMap`/spread bypassing the
one `.map(` call) would leave all three assertions green while the defect returned.

**Rendered-behaviour path considered and rejected, with evidence**: mounting `DocumentKindDialog`
and opening the real `@base-ui/react` Select popup was the preferred fix per this session's brief.
Confirmed by grep (`grep -rl "select-item\|SelectItem" apps/web --include=*.test.tsx`) that NO
test anywhere in this repo drives a base-ui Select popup open — the only match is this file's own
source-text check. The Select's `SelectContent` is `Portal` + `Positioner` (floating-ui) backed;
`test/domInspect.ts`'s own header already documents abandoning axe-core over exactly this class of
gap (no real layout engine), and the zero-geometry `getBoundingClientRect` stub it added was
built specifically to let `@base-ui/react`'s Menu/Dialog backdrops mount, not Select's positioning
path. Building that out for one minor finding was judged disproportionate and is recorded as such
in the test file's own comment (not silently skipped).

**Fix taken instead** (commit `fd52e936`): strengthened the structural-pin cell with
`assert.doesNotMatch(dialogSource, /consent_evidence/)`, proving the literal string is absent from
the WHOLE file, not merely from the mapped roster — this directly closes the exact gap named
above (a hardcoded `SelectItem` or a bypassed `.map(` would now fail). This required rewording one
line of an existing code comment in `document-kind-dialog.tsx` that named the excluded kind
literally (now points at `CLASSIFIABLE_DOCUMENT_KINDS`'s own header in `document-kind-control.tsx`
for the exact spelling) — no behaviour change, confirmed by re-running the file's tests.

**Vacuity control**: temporarily added `<SelectItem value="consent_evidence">...</SelectItem>`
beside the map in `document-kind-dialog.tsx`, re-ran the test — it failed specifically on the new
`doesNotMatch` assertion (`operator: 'doesNotMatch'`) — then restored the file; `git diff` against
the pre-vacuity-control copy showed only the intended comment reword, confirmed byte-identical
otherwise.

Test: `document-kind-labels.test.tsx` — `"[878] the DETAIL surface's classify Select also stops
offering a kind the door always refuses"` (green, 6/6 in the file).

## Per-finding outcomes — STANDARDS axis (`wave1-lane07-codereview-standards.json`)

### STD-01 (#876, minor smell) — FIXED, prior worker
`documents-intake-mock.mjs` reimplemented `in.(...)` query-param parsing inline instead of
reusing/adding the `inParam` helper its two sibling e2e mocks already had. Fixed in
`308bbecd4b8ca1e431cb76ec2c35f3ee53383758`: `documents-intake-mock.mjs` now exports its own
module-scope `inParam(url, key)`, and `namedLaneDocumentsIn` is
`(inParam(url, key) ?? []).filter((id) => laneDocumentIds().includes(id))`, matching
`document-correction-mock.mjs`'s own composition. Verified this session by reading
`apps/web/e2e/documents-intake-mock.mjs:194,377,386` directly — the helper and composition match
the required fix exactly.

### STD-02 (#904, minor smell) — FIXED, prior worker
`tasks.some((task) => NON_TERMINAL_TASK_STATUS.has(task.status))` was computed twice in
`DocumentDetail`. Fixed in `981d160a`: bound once as `hasNonTerminalTask`
(`document-detail.tsx:157`) and reused in both `enabled` (`:159`) and `tasksExhausted` (`:282`).
Verified this session by reading the file directly.

### STD-03 (#904, minor Data Clumps) — FIXED, prior worker
The `{ maxTicks?, baseDelayMs?, maxDelayMs? }` settle-poll options shape was hand-copied a third
time onto `DocumentDetail`'s props. Fixed in `981d160a`: both `documents-workbench.tsx:56` and
`document-detail.tsx:105` now declare `settlePoll?: Pick<SettlePollOptions, "maxTicks" |
"baseDelayMs" | "maxDelayMs">`, importing the type from `use-settle-poll.ts` instead of a third
hand copy. Verified this session by reading both files directly.

### STD-04 (#903, minor test-quality) — FIXED, prior worker
`needs-you-counts.test.tsx`'s `903.comment` cell asserted on a header comment's literal prose via
`readFileSync` + regex — a side channel per the /tdd anti-pattern list (breaks on a wording-only
edit with zero behaviour change). Fixed in `5fe37c2b`: that cell is gone; only `903.chips` (which
renders `NeedsYouCounts` and counts real DOM badges) remains. Verified this session: grep for
`readFileSync` in `needs-you-counts.test.tsx` finds nothing; `"903.chips — the live envelope's
counts render as exactly NINE chips, one per key"` is the sole #903 cell and is green.

### STD-05 (#878, minor test-quality) — FIXED, this session
A fourth assertion bundled inside the otherwise-justified `[878]` structural-pin cell checked a
retired comment's exact prose (`/observation it would not change/`) rather than which roster the
Select maps — unrelated to the cell's own stated justification (Base UI's popup mounts lazily).

**Fix** (commit `fd52e936`, same commit as CRS-07-09 — both touch the same cell): the assertion is
removed outright (not moved to a separate cell — its only value was pinning a one-time comment
edit already landed and verifiable by reading the file; a dedicated "comment hygiene" cell was
judged not worth a fifth assertion for a comment that is not expected to change again). The cell
now contains exactly the three structural-pin assertions plus the new CRS-07-09 whole-file
`consent_evidence` check.

### STD-06 (#904, note) — LEFT ALONE, as originally scored
The extraction-tasks Refresh button shares the `receiptsRefresh` message key with the unrelated
receipts-poll refresh control. Non-blocking note, not a defect; no commit in this lane's diff
(prior or this session) touches this key or either call site. Confirmed unchanged this session by
re-reading `document-metadata.tsx` and `messages/en.json`.

## Summary table

| id | ticket | severity | outcome | commit |
|---|---|---|---|---|
| CRS-07-01 | #987 | major | fixed | `a17f6a87` |
| CRS-07-02 | #904 | major | fixed | `981d160a` |
| CRS-07-03 | #903 | major | fixed | `5fe37c2b` |
| CRS-07-04 | #987 | minor | recorded, not fixed (kept) | `a17f6a87` (comment + msg) |
| CRS-07-05 | #903 | minor | recorded, no change needed | `5fe37c2b` (msg) |
| CRS-07-06 | #876 | minor | fixed (doc) | `4c507495` |
| CRS-07-07 | #900 | minor | fixed | `776f4284` |
| CRS-07-08 | #842 | minor | kept, recorded as deliberate override | `4e85cc0e` |
| CRS-07-09 | #878 | minor | fixed (strengthened) | `fd52e936` |
| STD-01 | #876 | minor | fixed | `308bbecd` |
| STD-02 | #904 | minor | fixed | `981d160a` |
| STD-03 | #904 | minor | fixed | `981d160a` |
| STD-04 | #903 | minor | fixed | `5fe37c2b` |
| STD-05 | #878 | minor | fixed | `fd52e936` |
| STD-06 | #904 | note | left alone (non-blocking) | — |

15/15 findings resolved to a recorded outcome (11 fixed in code/tests, 1 fixed as documentation,
2 recorded-and-kept with reasoning re-verified, 1 left alone as originally scored, non-blocking).
Nothing above minor remains open.

## Gates (this session)

**Touched/related test files**, `node --import ./test/bootstrap.mjs --import tsx --test <file>`
from `apps/web`:

| file | tests | pass | fail |
|---|---|---|---|
| `components/clara/interview-run-field-composition.test.tsx` | 3 | 3 | 0 |
| `lib/interview/useInterviewRun.test.ts` | 4 | 4 | 0 |
| `components/clara/interview-run-keyboard.test.tsx` | 2 | 2 | 0 |
| `components/clara/onboarding-progress-sync.test.tsx` | 3 | 3 | 0 |
| `components/documents/document-kind-labels.test.tsx` | 6 | 6 | 0 |
| `components/accounting/periodic-adjustments-table.test.tsx` | 4 | 4 | 0 |
| **total** | **22** | **22** | **0** |

`pnpm typecheck` (worktree root): exit 0 — `apps/web typecheck: Done`; `packages/runtime
typecheck: Done`.

`pnpm lint` (worktree root): exit 0 — `check-token-contrast` all WCAG AA pairs pass,
`check-test-manifest` 485 files listed/matched + selftest all PASS, `check-message-keys` 4301 keys
resolve + selftest all PASS, `check-ui-add-guard` selftest all PASS, eslint clean across every
package including `reporting-render`.

**Whole `apps/web` unit suite** (`node scripts/run-tests.mjs` from `apps/web`): exit 0 —
**4668 tests, 4666 pass, 0 fail, 2 skipped, 0 todo**, 135 suites, 70.1s. The 2 skips are the known,
environment-gated live-Supabase-auth-provider checks (`CLARA_LIVE_SUPABASE_AUTH_URL`/
`CLARA_LIVE_SUPABASE_AUTH_ANON_KEY` not configured on this rig; mocked coverage lives in
`components/entry/password-recovery.test.tsx` and `components/login-a11y.test.tsx`) — unrelated to
this lane, not a new skip. No `not ok` anywhere in the run; the RIG.md-documented
`thread-live-clarify.test.tsx` whole-suite load flake did not occur this run.

No `packages/db` or `packages/runtime` test files were touched by this session's changes (all four
findings are `apps/web`-only), so the db/runtime-specific gate chains in WORK-ORDER rule 8 do not
apply.

`git status --porcelain`: empty before and after every command in this session. Head at finish:
`4e85cc0e73ad726cfaba59a2db2448254b7910ce`.

## Docs touched

- Code comments only: `apps/web/lib/interview/useInterviewRun.ts` (new `errorHeldAtPark` field),
  `apps/web/components/clara/InterviewRunCard.tsx` (three comments explaining the CRS-07-07 split),
  `apps/web/components/documents/document-kind-dialog.tsx` (one comment reworded to drop a literal
  `consent_evidence` mention), `apps/web/components/accounting/periodic-adjustments-table.tsx`
  (CRS-07-08 override recorded at `CENTS_PARTICULARS`).
- No module `README.md` exists under `apps/web/components/clara`, `apps/web/lib/interview`,
  `apps/web/components/accounting`, or `apps/web/components/documents` to update, and
  `apps/web/README.md` does not currently document `CENTS_PARTICULARS`/#842's area — nothing to
  correct there. No new domain vocabulary was introduced (no `CONTEXT.md` change).

## Follow-ups worth filing

- **#842 CENTS_PARTICULARS scope**: the owner should rule, on #842 itself, whether the five-key
  widening is accepted as this lane argues (recommended: accept — the migration evidence is
  unambiguous) or whether the four extra keys should be split into their own ticket. This report
  and the code comment at `CENTS_PARTICULARS` carry the evidence; a lane worker cannot post to
  GitHub (WORK-ORDER rule 2).
- **#987 fiscal-year label (CRS-07-04)**: still recorded-not-fixed. Restoring the label needs
  `opening-seed-workbench.tsx` to grow its own `clara.list_fiscal_years` read (or the refusal
  detail to start carrying a label) — a small but real scope addition, appropriate for a follow-up
  ticket rather than a wave-1 lane fix.
- **Select-popup test infrastructure (CRS-07-09)**: if a future ticket needs to assert real
  rendered behaviour through an `@base-ui/react` Select popup, `test/domInspect.ts` will need new
  floating-ui-aware positioning shims beyond the existing zero-geometry `getBoundingClientRect`
  stub (built for Menu/Dialog backdrops, not Select's own Positioner). Worth scoping as its own
  small harness ticket rather than building it ad hoc inside a minor finding's fix.

## Anything unverified

- The two recorded-not-fixed minors (CRS-07-04, CRS-07-05) and the CRS-07-08 override rest on this
  report and code comments to reach the owner — none of them has been posted to the #987/#903/#842
  GitHub issues themselves, since lane workers may not write to GitHub (WORK-ORDER rule 2). That
  posting is the integrator's job, not done here.
- No Playwright/e2e walk was run this session: none of the four findings fixed here touch e2e
  fixtures, routes, or mocks (STD-01, the one finding that did, was already fixed and verified by
  the prior worker with its own e2e-adjacent unit gates, re-confirmed here by direct source
  reading rather than re-running Playwright).
