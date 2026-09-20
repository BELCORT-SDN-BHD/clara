# Wave 1 — Lane 08 — fix round 1

Branch `riders/w1-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`. Started from
`79037366` (the lane's original four commits, all local, never pushed). Four new commits, also
local:

```
b7c37447 fix(web): #1005 STD-1005-4 — pin trigger/option label parity at the two composed-label sites
ff3521f1 fix(web): #875/#879 fix-round — land the audit table, empty-state cell, mock hardening; #897/#956 docs
1659c4f1 fix(web): #874 fence the invite-mail endpoint override (ADV-1 blocker), reconcile AC2, doc env var
80a94719 fix(web): #1005/#956 fix-round — census bypasses, unmatched-value fallback, five missing cells, rejecting-sleep hang
```

New head: **`b7c37447`**.

Every blocker and major was reproduced before being fixed or refuted, per the fix-round's own
rule. Where a probe/vacuity control was staged (`git stash`/`pop`), the revert-and-confirm-red
step is recorded per finding below.

---

## Per finding

### SPEC-897-1 / ADV-6 — blocker — **partial** (AC4 fixed; AC2/AC3/AC1-focus-half deferred, with new evidence)

**Fixed:** AC4. `e2e/interview-walk.spec.ts`'s header now records that the full-screen altitude
arm lives in a mock lane, per DECISIONS §3.1 row 8 — the one part of the four that was pure
documentation and genuinely zero-risk. Commit `ff3521f1`.

**Deferred, with new evidence beyond what the review supplied.** The remaining three parts (AC2's
OPEN-park fixture, AC3's fixture-ownership declaration, and the focus-return half of AC1) require
building a NEW interview-runtime mock subsystem: `InterviewRunCard` is mounted directly inside
`ClaraRail`/`ClaraThreadView` (not a standalone page), so reaching it needs a client whose
onboarding plan is open, a chat-session-list entry, an `agent_tasks_visible`-shaped fixture, and
NEW runtime-proxy handlers for `/api/runtime/interview/client/start` and
`/api/runtime/interview/state` (traced against `lib/interview/api.ts` and
`lib/interview/useInterviewRun.ts` — confirmed buildable, session establishment is cheap via the
existing `signIn()` e2e helper, and `useInterviewRun`'s poll fires immediately on start rather
than waiting a real 3s). This is a genuine, multi-piece build touching the SHARED
`serve-built.mjs`/mock-lane estate nine other lanes depend on concurrently this wave — not a
same-shape addition to an existing fixture, which is what every other finding in this fix round
was.

**A finding of my own, beyond the review's:** I re-verified the review's claim that "the
FOCUS-RETURN half of AC1... is independent of [and, by implication, likely true despite] typed-data
survival." Tracing the actual mechanism (`components/clara/ClaraRail.tsx`'s `escalateHref` is a
plain `<Link>`, `components/clara/ClaraFullScreenThread.tsx`'s "Collapse" is also a plain
`<Link href={returnHref}>`, and `components/clara/rail-mount.tsx`'s own "WHAT SURVIVES A SWITCH"
note names client-owned React state, not focus) turned up **no explicit focus-restoration code
anywhere in this path**. Next.js App Router does not automatically return focus to a specific
pre-navigation DOM element across a full route-group change (`(firm)` <-> `(full)` are, per that
file's own header, genuinely separate layout trees). So the premise that focus-return is a "safe
half to build" is itself unconfirmed — my own reading suggests it is at least as likely to be
false as typed-data survival, for the identical underlying reason (a full unmount/remount with no
explicit restoration). This does not change what ships this round, but it changes what the
owner's ruling should weigh: **both** halves of AC1, not one, may need the same successor-contract
treatment (`InterviewRunCard`'s draft and the escalate button's focus both threaded through a
persistence/restoration mechanism keyed the way `claraThreadStore.drafts` already keys the
composer's own draft).

**Successor contract (superseding the prior lane's, narrower and better-evidenced):** whoever
picks this up next should (a) get the owner's ruling on whether the typed-data-survival AND
focus-return criteria are read as literal cross-navigation survival or something narrower, (b)
build the interview-runtime mock handlers this investigation scoped out, and (c) if survival is
ruled required, wire both `InterviewRunCard`'s draft and `ClaraRail`'s escalate-button ref through
a `claraThreadStore`-keyed persistence/restoration mechanism before writing the walk that asserts
either half.

### ADV-1 — blocker — **fixed**

`INVITE_MAIL_ENDPOINT_OVERRIDE` was a production-live outbound-egress override with no fence at
all. Renamed to `CLARA_E2E_INVITE_MAIL_ENDPOINT` and fenced: `inviteMailCapability` now honours it
only when it parses as an http(s) URL whose host is loopback (`isLoopbackMailEndpoint`); anything
else is treated exactly like an absent override. Five new cells in
`tests/invite-mail-transport.test.ts` prove a non-loopback host, a `localhost`-lookalike hostname,
a bare path, and a `javascript:` scheme are all rejected, and that the IPv6 loopback spelling is
honoured (38/38 in that file). **Vacuity control:** reverting `lib/members/invite-mail.ts` alone
(`git stash`/`pop`) made exactly the four new/changed cells fail (env-name assertion + three fence
cells), everything else stayed green; restored byte-for-byte. Commit `1659c4f1`.

### SPEC-874-1 — major — **refuted (reconciled), not built**

AC2 (a Playwright walk substituting the endpoint) is unmet at the harness level, independent of
the fence above. Confirmed unchanged: `e2e/members-lifecycle-mock.mjs` still sets no
`RESEND_API_KEY`, so the invite leg still terminates at `mail_not_configured` before any Supabase
admin call, and reaching `send()` from a real browser walk still needs `GoTrueAdminApi`'s
`listUsers`/`generateLink` mocked under `/e2e-supabase` — the ticket's own "why human" note left
that as a separate owner call, and this fix round did not re-litigate it. Wiring the harness env
without that second seam would prove only that the variable is read (already pinned at the unit
level), not that a real invite flow reaches `send()` — the thing AC2 actually asks for — so
building only that half was rejected as a half-measure rather than attempted and left broken.
Recorded in `apps/web/README.md`'s Membership section rather than left ambiguous. Commit
`1659c4f1`.

### STD-874-2 — minor — **fixed**

`CLARA_E2E_INVITE_MAIL_ENDPOINT` added to `apps/web/.env.example`, marked test-only. Commit
`1659c4f1`.

### SPEC-1005-2 / ADV-5 — major — **fixed**

`components/ui/select.test.tsx`'s header claimed per-call-site coverage across ten test files;
four never existed and two carried no `#1005` cell at all — measured via
`grep -rl "\[1005\]" --include="*.test.tsx"`, which found exactly five files (not ten). The header
now names exactly those five, plus the five that were added this round (below) instead of
resting on the census alone. Commit `80a94719`.

### SPEC-1005-3 — major — **fixed**

`select-value-label-census.test.ts`'s `childIsFunction` accepted a bare identifier/property-access
child as "a function," so `<SelectValue>{value}</SelectValue>` (the exact defect the census exists
to catch) passed clean. Reproduced with a synthetic in-memory source (no probe file touched the
worktree) before fixing: the pre-fix logic flagged 0 violations for that exact JSX. Fixed by
accepting only `ArrowFunction`/`FunctionExpression` node kinds — the one real function-child call
site (`client-period-selector.tsx`) always passes an inline arrow, so nothing legitimate needed
the wider allowance. New regression cell proves the bypass is now caught, and a third new cell
proves a legitimate function-child site still passes (no false positive introduced). Commit
`80a94719`.

### ADV-3 — major — **fixed**

The same census file's `tagNameOf` returned `null` for a qualified JSX name, so `<Select.Value />`
reached via `import { Select } from "@base-ui/react"` (the root barrel, not the `/select`
subpath already checked) was never counted as a call site, and the import check only matched the
exact `@base-ui/react/select` specifier. Reproduced the same way (synthetic source, in-memory):
pre-fix, both the import and the qualified tag went unflagged. Fixed by (a) resolving a
`PropertyAccessExpression` tag name to a dotted string and flagging anything ending in `.Value`
outside the wrapper file, and (b) additionally flagging a root-barrel import that names `Select`.
The wrapper's own internal `<SelectPrimitive.Value>` usage (fed an identifier, not an inline
function) is explicitly exempted from both checks — it is the mechanism, not a call site of it.
Commit `80a94719`.

### SPEC-1005-1 / ADV-9 — major — **fixed**

Five call sites had no first-render trigger-text cell. Closed all five:
- `work-question-form.tsx`'s account field — a preset `localStorage` draft
  (`writeWorkAnswerDraft`) puts the field in a selected state before mount; no production change
  needed.
- `unassigned-sources.tsx`'s `SourceRow` — exported (it was module-private) so it can be mounted
  in isolation with a new `initialClientId` prop (no production caller; test-only, default `""`
  preserves the one existing call site byte for byte).
- `correction-wizard.tsx`, `document-kind-control.tsx`, `document-kind-dialog.tsx` — each gained
  an analogous optional `initial*` prop. All three render their Select inside a Base UI Dialog,
  which is a PORTAL into `document.body` — a separate subtree the render container never reaches
  (confirmed empirically: my first attempt at these three cells asserted only the outer trigger's
  own text, "Classify"/"Set kind", because `h.text()` never sees portalled content). Fixed by
  following `close-t1-opener.test.tsx`'s own house pattern: append the render container into
  `document.body` before interacting, then read text from `document.body` rather than from
  `h.text()`.

Each new cell's vacuity was checked directly (not assumed): reverting the four production files
together (`git stash`/`pop`, keeping the new tests) made exactly the four new/changed cells fail
for the right reason (the destructure-parameter omission I'd introduced surfaced immediately as a
`ReferenceError`, then the real assertions failed once that was fixed and re-verified); restored
byte-for-byte. Commit `80a94719`.

### ADV-2 — major — **fixed**

`resolveSelectValueLabel` fell back to `placeholder` for ANY unmatched value, so a well-formed but
roster-absent filter value (an archived client, a purpose newer than `KNOWN_PURPOSES`, a former
member's id) rendered the SAME "All clients"/"All kinds"/"Anyone" text the trigger shows when
nothing is filtered — an applied filter reading as unfiltered. New `withUnmatchedFallback` helper
in `select.tsx` synthesizes a distinguishable entry for the current value when the roster does not
carry it; wired into `activity-filters.tsx`'s client filter and `work-list-filters.tsx`'s
client/purpose/initiator filters (three more call sites had the identical latent defect, found
while fixing the one the review named). New message keys
`filterClientUnknown`/`filterPurposeUnknown`/`filterInitiatorUnknown`. **Vacuity control:**
reverting `select.tsx` + `activity-filters.tsx` + `en.json` made the new ADV-2 cell fail with the
exact pre-fix text ("ClientAll clients...", i.e. reading as unfiltered); restored byte-for-byte.
Commit `80a94719`.

### ADV-4 — major — **fixed**

`abortableSleep`'s `sleepImpl(ms).then(finish)` (one argument) left a REJECTING `sleepImpl` with
no handler — an unhandled rejection, and `finish` never called, so the awaited
`runClaraTaskStream` hung forever. Fixed to `.then(finish, finish)`. **Vacuity control:** reverting
`stream.ts` alone reproduced exactly the predicted failure — `failureType: 'unhandledRejection'`,
`error: 'transport clock exploded'`, stack pointing at the exact pre-fix line — then restored
byte-for-byte. Commit `80a94719`.

### SPEC-956-1 / ADV-8 — minor — **deferred, not fixed**

The absence cell's own reattach timer (opened at hydrate for a task the "already finished" stop
never calls `abortStream` for) is still a real ~1s wall-clock backoff racing a fixed 20-macrotask
settle budget — safe in practice (a real second vs. microtask-speed polling), not safe by
construction. Closing this needs `useClaraThread`/`attachClaraStream` to accept an optional
`sleepImpl` override — no such seam exists in that hook's public API today, anywhere in this
codebase. Adding one purely to make one test cell deterministic is the same class of concern ADV-7
(below) raises about `abortAllStreams`: new production surface added to serve one test's
determinism, for a race this fix round measured (25/25 isolated, whole-suite run) but did not
observe. Judged disproportionate for a minor on an already-shipped ticket; not built.

### SPEC-875-1 / STD-875-2 / ADV-11 — minor — **all fixed**

The poll-budget audit table (#875's whole deliverable) now lives in `apps/web/README.md` instead
of only in an uncommitted report (STD-875-2). Re-verified every row against the real source before
landing it and found two more inaccuracies beyond the one the review caught (ADV-11's
`work-question-affordance.tsx` path): `checkout-faces-a11y.test.tsx` lives under
`components/entry/`, not `components/checkout/`, and the budget constant is
`CHECKOUT_REFRESH_BUDGET_MS`, not `BUDGET_MS`. All twelve file paths and eight constant names in
the table are now confirmed to exist via direct `test -f`/`grep` checks, not carried over from the
prior report. The survey's own scope (the brief's eight pollers) is now stated explicitly, with
the two further pollers checked separately (SPEC-875-1). Commit `ff3521f1`.

### SPEC-879-1 — minor — **fixed**

The brief's "empty first-use state" was never driven. `staff-advances-register-mock.mjs` gained a
second, distinct client id (`SAR.emptyClientId`, zero enrolments, zero advances); new walk cell
asserts the three honest empty-state sentences and that "Enrol account" stays offered. Verified
green against lane 08's own Playwright triple (4/4 in the file, including the new cell); the
dispatch-order neighbour `staff-expense-claim-walk.spec.ts` still passes 13/13 (no regression).
`e2e-fixture-ownership.test.ts`'s client-id census (mechanical, reads source text) picked up the
new id automatically with no collision (20/20). Commit `ff3521f1`.

### STD-879-2 — minor — **fixed**

The mock's private `readJson` is gone; every RPC branch now reads through the shared
`readCachedJson` (`mock-dispatch.mjs`), and a new `OWNED_RPC_VERBS` Set (`matchVerb`) gates on verb
membership before any read is attempted, matching the shared helper's own documented house
pattern. Commit `ff3521f1`.

### ADV-10 — minor — **fixed**

`enrol_staff_advance_account` is now idempotent per account code (a second call for an
already-active enrolment returns the existing row rather than minting a duplicate) — not
reachable under today's `retries: 0`, but no longer a live hazard if that config ever changes. The
book-application step's CLR-absence check now runs AFTER a positive, book-specific settle signal
(the summary's own "RM 700.00 outstanding" re-read), not against a page that had just had a
dialog close and nothing else awaited. The "cell 3 can only pass as part of a whole-file run"
observation itself is an acknowledged, deliberate design property (`playwright.config.ts`'s
`workers: 1`), not something this finding asked to remove. Commit `ff3521f1`.

### STD-1005-4 — minor — **fixed at the two highest-risk sites; the rest scoped down, with reasoning**

`matching-section.tsx` (account + period selects) and `work-question-form.tsx` (the account
field) each built the same composed, multi-field label as two independent inline template
literals — real drift risk, since a future edit to one copy silently would not touch the other.
Each now calls one label function from both the trigger and the option list. The other eight
`#1005` call sites pass a single existing field or a single `t(...)`/`renderKindLabel(...)` call
through unchanged in both places already — the STRING computation is already the same function
call, so the structural duplication (`.map()` twice) carries materially less drift risk than a
hand-typed composed literal. Judged a proportionate scope for a minor finding rather than a
mechanical refactor of all ten sites. Commit `b7c37447`.

### ADV-7 — minor — **deferred, not fixed**

`claraThreadStore.abortAllStreams()` has no production caller. Investigated both options the
finding offers: (a) moving teardown into the test file over its own tracked task ids using the
existing `abortStream(taskId)` — infeasible without a large, risky refactor of a ~1300-line test
file with no single choke point where every cell's task id is already recorded; (b) giving it a
real production caller — checked `components/logout-button.tsx` (the one plausible candidate) and
confirmed `threadStore.ts`'s own header explicitly documents that "a live tab keeps a task's read
running across an ordinary sign-out, BY DESIGN." Wiring `abortAllStreams()` into sign-out would
directly contradict that documented product decision, not merely add unused surface. Both offered
fixes are actively wrong or disproportionate; left as the honestly-documented, tested,
harmless test-support primitive it already was.

---

## Gates, with counts

- `pnpm typecheck` (worktree root): clean, re-run after every commit and once more at the end.
- `pnpm lint` (worktree root): clean, re-run after every commit and once more at the end.
- Whole `apps/web` unit suite (`node scripts/run-tests.mjs`), final run: **4670 tests, 4668 pass,
  0 fail, 2 skipped** (pre-existing, unrelated to this lane).
- `lib/clara/use-clara-thread-stop.test.ts` isolated: **25/25 pass** (re-confirmed after the
  ADV-4 fix, matching the original lane's own count).
- `e2e/e2e-fixture-ownership.test.ts`: **20/20** (client-id and verb censuses both clean with the
  new empty-client id and the new verb-Set gate).
- `staff-advances-register-walk.spec.ts` (lane 08's own Playwright triple, 3570/3571/3572):
  **4/4**, including the new empty-first-use-state cell.
- `staff-expense-claim-walk.spec.ts` (dispatch-order neighbour, regression check): **13/13**.
- `node scripts/check-frozen-workflows.mjs`: OK, 312 frozen files, no manifest diff.
- Per-file targeted runs at each fix point (recorded per finding above): all green, several with
  an explicit `git stash`/`pop` vacuity control confirming red-for-the-right-reason before the
  restore.

## Docs updated

- `apps/web/README.md`: `#874` (the fence + AC2 reconciliation), `#875` (new section, the audit
  table), `#956` (the ADV-4 fix recorded).
- `apps/web/.env.example`: `CLARA_E2E_INVITE_MAIL_ENDPOINT`.
- `e2e/interview-walk.spec.ts`: header note for `#897`'s AC4.

## Successor contracts

- `#897` — see the finding above: the owner's ruling is needed on whether AC1's two halves mean
  literal cross-navigation survival; if so, both `InterviewRunCard`'s draft and `ClaraRail`'s
  escalate-button focus need the same `claraThreadStore`-keyed treatment the composer's own draft
  already has, and a new interview-runtime mock subsystem needs building before the walk that
  asserts either half.
- `#874`'s second seam (`GoTrueAdminApi` mocked under `/e2e-supabase`) — unchanged from the
  original report; still the owner's call.

## Follow-ups worth filing

- `SPEC-956-1`/`ADV-8`: the absence cell's own reattach timer is a real (if practically
  never-observed) race; closing it needs a `sleepImpl` seam on `useClaraThread`'s public hook API
  that does not exist today.
- `ADV-7`: `abortAllStreams()` remains uncalled in production; both offered remedies were found
  actively wrong (contradicts a documented sign-out design decision) or disproportionate (a large
  test-file refactor) — recorded rather than actioned.
- `STD-1005-4`'s remaining eight call sites: lower-risk (single-field/single-function labels), not
  hoisted this round.
- `documents-workbench-refresh.test.tsx`'s `"[633]: an UNSETTLED receipt..."` cell — carried over
  from the original report, untouched this round (out of #875's own scope).

## Anything unverified

- `#897`'s "likely false today" conclusion for BOTH halves of AC1 rests on static tracing
  (file:line evidence, above), not an empirical Playwright reproduction — building that harness is
  most of the cost of the fixture the successor contract already names.
- `#874`'s AC2 remains verified at the unit level only (carried over from the original report,
  unchanged this round).
